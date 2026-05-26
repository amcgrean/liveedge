// The `shapefile` npm package ships its own runtime but no type definitions
// (and no maintained @types/shapefile on DefinitelyTyped). We only use it
// from a couple of one-off loader scripts (inspect-dallas-shp.ts,
// load-dallas-into-index.ts), so a minimal ambient shim is enough to keep
// the Next.js typecheck happy without pulling in a 3rd-party type fork.
declare module 'shapefile';
