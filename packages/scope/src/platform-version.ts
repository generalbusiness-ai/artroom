/** Exact code availability at this preparation boundary. This is not the
 * adopted historical bundle/provenance resolver or an activation decision. */
import type { PlatformDefinition } from "@generalbusiness/artroom-contract";
import { isPlatformDefinition, platformName } from "@generalbusiness/artroom-bytes";
import { platform } from "@generalbusiness/artroom-platform";

export const knownPlatform = (named: unknown, family: string): named is PlatformDefinition => isPlatformDefinition(named) && platformName(named) === family && platform(named) !== null;
