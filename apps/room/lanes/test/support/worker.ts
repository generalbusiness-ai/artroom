/**
 * The Worker that the lane scenarios run: the scope package's own test
 * classes, and nothing of this package. `NetScope` is the scope's object
 * class as it is deployed, in one namespace, with the test ports: the test
 * authority and readers, one scripted clock, transport that a test can
 * disturb, the scripted test capability and the scripted peers. `NetService`
 * and the default export are the deployed entrypoint and routes over that
 * namespace. Nothing is deployed from this file.
 */

export { NetScope, NetService, PlatformScope, default } from "@generalbusiness/artroom-scope/testing/worker";
