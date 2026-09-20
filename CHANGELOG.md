# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-20

### Added
- Agent class with iterative tool-calling loop
- ToolRegistry with OpenAI function-calling format export
- Built-in tools: web_search, read_file, write_file, list_directory, run_command
- Two-tier memory system (working + long-term)
- Orchestrator for multi-agent coordination (delegate, parallel, sequential, pipeline, fan-out)
- Inter-agent communication protocol
- CLI with run, tools, and validate commands
- Streaming support via AsyncGenerator
- Full test suite
