/** The lending library of notes/2026-10-13-lending-library.md, using existing declaration forms only. */
import type { DeclaredDefinition } from "@generalbusiness/dap-contract";

export const lending: DeclaredDefinition = {
  "format": "artroom-definition-1",
  "name": "lending",
  "profile": {"name": "restricted", "version": 1},
  "capabilities": [],
  "genesis": "establish",
  "items": {
    "library": {
      "many": false,
      "max": 1,
      "states": {"open": {"final": false}},
      "initial": "open",
      "parties": {"founder": {"fixed": true, "required": true, "list": false, "author": false}},
      "refs": {},
      "values": {}
    },
    "thing": {
      "many": true,
      "max": 64,
      "states": {"available": {"final": false}, "lent": {"final": false}, "gone": {"final": true}},
      "initial": "available",
      "parties": {
        "donor": {"fixed": true, "required": true, "list": false, "author": false},
        "borrower": {"fixed": false, "required": false, "list": false, "author": false}
      },
      "refs": {},
      "values": {
        "name": {"fixed": true, "required": true, "of": {"type": "text", "max": 80}},
        "description": {"fixed": true, "required": true, "of": {"type": "text", "max": 1000}},
        "reason": {"fixed": false, "required": false, "of": {"type": "text", "max": 280}}
      }
    }
  },
  "acts": {
    "establish": {
      "step": "open",
      "on": "library",
      "grant": "lending.establish",
      "also": {},
      "fields": {"opener": {"type": "member", "required": true}},
      "guards": [],
      "effects": [{"party": {"slot": "founder", "from": {"field": "opener"}}}],
      "sends": [],
      "attention": []
    },
    "donate": {
      "step": "open",
      "on": "thing",
      "grant": "lending.member",
      "also": {},
      "fields": {
        "name": {"type": "text", "max": 80, "required": true},
        "description": {"type": "text", "max": 1000, "required": true}
      },
      "guards": [],
      "effects": [
        {"party": {"slot": "donor", "from": {"signer": true}}},
        {"value": {"slot": "name", "from": {"field": "name"}}},
        {"value": {"slot": "description", "from": {"field": "description"}}}
      ],
      "sends": [],
      "attention": []
    },
    "borrow": {
      "step": "transition",
      "on": "thing",
      "grant": "lending.member",
      "also": {},
      "fields": {},
      "guards": [{"state": ["available"]}],
      "effects": [{"state": "lent"}, {"party": {"slot": "borrower", "from": {"signer": true}}}],
      "sends": [],
      "attention": []
    },
    "return": {
      "step": "transition",
      "on": "thing",
      "grant": "lending.member",
      "also": {},
      "fields": {},
      "guards": [{"state": ["lent"]}],
      "effects": [{"state": "available"}, {"party": {"slot": "borrower", "from": null}}],
      "sends": [],
      "attention": []
    },
    "cancel": {
      "step": "transition",
      "on": "thing",
      "grant": "lending.staff",
      "also": {},
      "fields": {"reason": {"type": "text", "max": 280, "required": true}},
      "guards": [{"state": ["available", "lent"]}],
      "effects": [
        {"state": "gone"},
        {"value": {"slot": "reason", "from": {"field": "reason"}}},
        {"party": {"slot": "borrower", "from": null}}
      ],
      "sends": [],
      "attention": []
    }
  },
  "receives": {},
  "timed": {},
  "rules": {}
};

/** No create sends: the complete declared closure is this definition alone. */
export const lendingClosure: readonly DeclaredDefinition[] = [lending];
