# Working on this harness

Keep changes small and reuse the pinned Pi extensions. Read README.md for the
trust boundary and prototype limitations. Never weaken sandbox requirements or
remember approvals to make a test pass. Do not put credentials in fixtures or logs.
Run `npm test`, `npm run check`, and `npm run doctor` after policy/runtime changes.
Sandbox tests execute real bubblewrap on Linux and Seatbelt on macOS, not mocks;
unavailable namespaces or Seatbelt are setup failures. Remote validation must be reported separately from local tests.
Any directory, including the home directory or harness source, may be the project
workspace. Do not require workspace separation from Pi state.
