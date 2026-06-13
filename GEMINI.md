# Project Mandates: Context Efficiency

To support agents with limited context windows, all agents working in this repository MUST adhere to the following strict efficiency rules:

## 1. Minimal File Access
- **NEVER** read a file in its entirety unless it is small (< 100 lines) or absolutely required for full understanding.
- **ALWAYS** prefer `list_directory` or `glob` to understand the directory structure before accessing any file.
- **ALWAYS** use `grep_search` to locate specific code patterns, symbols, or logic instead of scanning files manually.

## 2. Surgical Reading
- When reading a file is necessary, use `start_line` and `end_line` in `read_file` to extract only the relevant snippet.
- Avoid reading multiple files in parallel unless they are directly related to the current sub-task.

## 3. Discovery Protocol
1. **List**: Use `list_directory` to see the map of the folders.
2. **Search**: Use `grep_search` to find where things are defined or used.
3. **Target**: Read only the lines identified by the search.

**Violation of these rules leads to context exhaustion and task failure. Prioritize structural discovery over deep reading.**
