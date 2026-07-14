# Contributing to @schema-weaver/migration-engine

By submitting a pull request, you agree your code is licensed under BSL 1.1, the same license as this project.

## Development Setup

1. **Fork & Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/migration-engine.git
   cd migration-engine
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up PostgreSQL**
   - Install PostgreSQL 14, 16, or 18
   - Create a test database
   ```bash
   createdb migration_test
   ```

4. **Configure Environment**
   ```bash
   export TEST_PG_URL="postgresql://postgres:password@localhost:5432/migration_test"
   ```

5. **Run Tests**
   ```bash
   npm test
   ```

## Project Structure

```
src/
├── introspection/     # Layer 1: Schema capture
├── differ/           # Layer 2: Change detection
├── ddl-generator/    # Layer 3: SQL generation
├── planner/         # Layer 4: Migration planning
├── risk/            # Layer 5: Risk assessment
├── executor/        # Layer 6: Execution
├── storage/         # Layer 7: History tracking
├── behavioral/      # Track 2: Functions, views, triggers
└── types/           # Type definitions
```

## Guidelines

### Code Style
- **One feature/fix per PR** — Keep pull requests focused
- **Follow existing patterns** — Match the codebase style
- **No unnecessary comments** — Self-documenting code preferred
- **ESM modules** — All imports must use `.js` extension

### Testing
- **Add tests for new functionality**
- **Run full test suite before pushing**
- **Keep introspection coverage at 98%+**

```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

### Adding Support for New Object Types

1. Add introspector in `src/introspection/queries/`
2. Add type definition in `src/types/`
3. Add DDL generator in `src/ddl-generator/`
4. Add planner rules in `src/planner/`
5. Add tests at all 6 layers

### Commit Messages

Follow conventional commits:
- `feat: add support for GENERATED ALWAYS columns`
- `fix: handle NULLS NOT DISTINCT in index diff`
- `docs: update API reference for introspect()`
- `test: add composite type coverage tests`

## Pull Request Process

1. **Create a branch** from `main`
2. **Make your changes** following these guidelines
3. **Run tests** and ensure they pass
4. **Submit PR** using our PR template
5. **Address review feedback** promptly

## Questions?

- Open an issue for bugs or feature requests
- Check existing issues before creating new ones
- Use GitHub Discussions for questions

## License

By contributing, you agree that your contributions will be licensed under the Business Source License 1.1 (BSL-1.1).

---

Thank you for contributing to Schema Weaver!
