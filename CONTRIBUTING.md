# Contributing to gz-agent

Thanks for your interest in contributing to gz-agent! This document covers the process for getting changes into the project.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/oke3/gz-agent.git
cd gz-agent

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Type-check
npm run typecheck
```

## Project Structure

```
src/
├── core/
│   ├── types.ts          All types
│   ├── agent.ts          Agent class
│   ├── tool.ts           Tool registry
│   └── memory.ts         Memory system
├── coordination/
│   ├── orchestrator.ts   Multi-agent coordinator
│   └── protocol.ts       Communication protocol
├── cli.ts                CLI entry point
└── index.ts              Barrel export
test/
├── agent.test.ts
├── tool.test.ts
├── memory.test.ts
├── orchestrator.test.ts
└── protocol.test.ts
```

## Code Style

- TypeScript strict mode
- ES modules (`import`/`export`)
- No external runtime dependencies (Node.js built-ins only)
- Async/await everywhere
- JSDoc on all public APIs

## Testing

- Write tests for all new features
- Run `npm test` before submitting
- Tests should not require external services (mock LLM endpoints)

## Pull Requests

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit with clear messages
4. Push and open a PR
5. Ensure CI passes (type-check + tests)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
