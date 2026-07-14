/**
 * @typedef {Object} ConnectionConfig
 * @property {string} host
 * @property {number} port
 * @property {string} database
 * @property {string} user
 * @property {string} password
 * @property {boolean|{ca:string,cert:string,key:string}} [ssl]
 * @property {string[]} [schema]
 * @property {Record<string,string>} [options]
 */

/**
 * @typedef {ConnectionConfig & {maxConnections?:number,idleTimeoutMs?:number,connectionTimeoutMs?:number}} PoolConfig
 */

export {};
