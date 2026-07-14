import crypto from 'crypto';

export class LockManager {
  isLocked = false;
  lockId = null;
  connectionId = null;
  _heartbeatTimer = null;
  _heartbeatClient = null;

  constructor(pool, options = {}) {
    this.pool = pool;
    this.locks = new Map();
    this.connectionId = options.connectionId || null;
    this.lockId = this.computeLockKey(this.connectionId);
  }

  computeLockKey(connectionId) {
    if (!connectionId) {
      console.warn(
        '[SchemaWeaver] No connectionId for lock key computation. ' +
        'Using default lock key. This may cause cross-database lock conflicts.'
      );
      return 12345;
    }

    const hash = crypto.createHash('sha256')
      .update(`schema-weaver-lock:${connectionId}`)
      .digest();

    const lockKey = hash.readInt32BE(0);

    return Math.abs(lockKey) || 1;
  }

  async acquire(lockKey, timeout) {
    const effectiveKey = lockKey || this.lockId;
    const client = await this.pool.connect();

    try {
      if (timeout) {
        await client.query(`SET lock_timeout = '${timeout}'`);
      }

      const result = await client.query(
        'SELECT pg_try_advisory_lock($1) as acquired',
        [effectiveKey]
      );

      const acquired = result.rows[0].acquired;

      if (acquired) {
        this.isLocked = true;
        this.lockId = effectiveKey;
        this.locks.set(effectiveKey, {
          acquiredAt: new Date().toISOString(),
          client,
          key: effectiveKey,
        });
      }

      return acquired;

    } catch (error) {
      client.release();
      throw error;
    }
  }

  async acquireAndWait(lockKey, timeout) {
    const effectiveKey = lockKey || this.lockId;
    const client = await this.pool.connect();

    try {
      if (timeout) {
        await client.query(`SET lock_timeout = '${timeout}'`);
      }

      const startTime = Date.now();

      await client.query('SELECT pg_advisory_lock($1)', [effectiveKey]);

      this.isLocked = true;
      this.lockId = effectiveKey;
      this.locks.set(effectiveKey, {
        acquiredAt: new Date().toISOString(),
        client,
        key: effectiveKey,
        waitTime: Date.now() - startTime,
      });

      return true;

    } catch (error) {
      client.release();

      if (error.code === '55P03') {
        return false;
      }
      throw error;
    }
  }

  async release(lockKey) {
    const effectiveKey = lockKey || this.lockId;
    const lockInfo = this.locks.get(effectiveKey);

    this.stopHeartbeat();

    if (lockInfo) {
      const { client } = lockInfo;

      try {
        await client.query('SELECT pg_advisory_unlock($1)', [effectiveKey]);
        this.locks.delete(effectiveKey);
        this.isLocked = false;
        this.lockId = null;
        return true;
      } catch {
        this.isLocked = false;
        this.lockId = null;
        return false;
      } finally {
        client.release();
      }
    }

    const standaloneClient = await this.pool.connect();
    try {
      await standaloneClient.query('SELECT pg_advisory_unlock($1)', [effectiveKey]);
      this.locks.delete(effectiveKey);
      this.isLocked = false;
      this.lockId = null;
      return true;
    } catch {
      this.isLocked = false;
      this.lockId = null;
      return false;
    } finally {
      standaloneClient.release();
    }
  }

  async isLocked(lockKey) {
    const effectiveKey = lockKey || this.lockId;
    const selfHeld = this.locks.has(effectiveKey);

    if (selfHeld) {
      return { held: true, heldBySelf: true };
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT pg_try_advisory_lock($1) as acquired',
        [effectiveKey]
      );

      const acquired = result.rows[0].acquired;

      if (acquired) {
        await client.query('SELECT pg_advisory_unlock($1)', [effectiveKey]);
        return { held: false, heldBySelf: false };
      }

      return { held: true, heldBySelf: false };

    } finally {
      client.release();
    }
  }

  isHeldBySelf(lockKey) {
    const effectiveKey = lockKey || this.lockId;
    return this.locks.has(effectiveKey);
  }

  async releaseAll() {
    let count = 0;

    for (const [lockKey] of this.locks) {
      try {
        await this.release(lockKey);
        count++;
      } catch {
      }
    }

    return count;
  }

  startHeartbeat(lockKey, intervalMs = 30000) {
    this.stopHeartbeat();
    const effectiveKey = lockKey || this.lockId;
    this.lockId = effectiveKey;

    this._heartbeatTimer = setInterval(async () => {
      try {
        await this.heartbeat();
      } catch {
      }
    }, intervalMs);
  }

  stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  async heartbeat() {
    if (!this.isLocked || !this.lockId) {
      return false;
    }

    const held = await this.isLockHeld(this.lockId);
    if (!held) {
      this.isLocked = false;
      throw new Error(`Advisory lock ${this.lockId} is no longer held. Connection may have been recycled.`);
    }
    return true;
  }

  async isLockHeld(lockKey) {
    const effectiveKey = lockKey || this.lockId;
    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM pg_locks WHERE locktype = 'advisory' AND objid = $1`,
      [effectiveKey]
    );
    return result.rows[0].count > 0;
  }

  async forceRelease(lockKey) {
    const effectiveKey = lockKey || this.lockId;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT pg_try_advisory_lock($1) AS acquired`,
        [effectiveKey]
      );
      if (result.rows[0].acquired) {
        await client.query(`SELECT pg_advisory_unlock($1)`, [effectiveKey]);
        this.isLocked = false;
        this.locks.delete(effectiveKey);
        return true;
      }
      return false;
    } finally {
      client.release();
    }
  }

  async checkDeadlock(lockKey) {
    const effectiveKey = lockKey || this.lockId;
    const client = await this.pool.connect();

    try {
      const lockWaitQuery = `
        SELECT
          blocked.pid AS blocked_pid,
          blocked.query AS blocked_query,
          blocking.pid AS blocking_pid,
          blocking.query AS blocking_query,
          now() - blocked.query_start AS wait_duration
        FROM pg_stat_activity blocked
        JOIN pg_locks blocked_locks ON blocked_locks.pid = blocked.pid
        JOIN pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
          AND blocking_locks.database = blocked_locks.database
          AND blocking_locks.relation = blocked_locks.relation
          AND blocking_locks.pid != blocked_locks.pid
        JOIN pg_stat_activity blocking ON blocking.pid = blocking_locks.pid
        WHERE blocked_locks.granted = false
      `;

      const result = await client.query(lockWaitQuery);

      return {
        blockedQueries: result.rows,
        hasPotentialDeadlock: result.rows.length > 0,
      };

    } finally {
      client.release();
    }
  }

  async getAllLocks() {
    const client = await this.pool.connect();

    try {
      const result = await client.query(`
        SELECT
          locktype,
          objid AS lock_key,
          pid,
          mode,
          granted
        FROM pg_locks
        WHERE locktype = 'advisory'
      `);

      return result.rows;

    } finally {
      client.release();
    }
  }
}
