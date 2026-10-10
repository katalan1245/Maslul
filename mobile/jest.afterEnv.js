// Each test mounts the app afresh: where the previous one left it isn't kept (see src/ui/navMemory.ts).
afterEach(() => {
  require('./src/ui/navMemory').navMemory.state = undefined;
});
