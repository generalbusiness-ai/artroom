/**
 * A definition whose names are `__proto__` wherever a definition may choose a name the server keeps in a dictionary: a required
 * text field, a member of a record field, a presented fact and an `also` alias. It is parsed from JSON, as a definition arrives,
 * so each `__proto__` is an own name of its record. The native validator admits each of them (sections 6.1 and 17.2). Its genesis
 * takes the fields the directory's `open-issue` sends, so the room's directory creates it as a lane. `stock` and `close` declare
 * optional names that an object's prototype also has (`__proto__`, `constructor`, `toString`, `valueOf`), for omission.
 * `recheck` binds its `also` item by an optional field whose default, 2, is the first jar the lane opens; `glance` binds it by
 * an optional field with no default; `verify` binds it by a fact field, the fill that opened the jar; `shake` moves a jar's
 * revision.
 */
import type { DeclaredDefinition } from "@generalbusiness/dap-contract";

export const pantry = JSON.parse(`{
  "format": "artroom-definition-1", "name": "pantry", "profile": { "name": "restricted", "version": 1 }, "capabilities": [], "genesis": "start",
  "items": {
    "shelf": {
      "many": false, "max": 1, "initial": "open", "states": { "open": { "final": false } },
      "parties": { "keeper": { "fixed": true, "required": true, "list": false, "author": false } }, "refs": {},
      "values": { "title": { "fixed": false, "required": false, "of": { "type": "text", "max": 256 } } }
    },
    "jar": {
      "many": true, "max": 20, "initial": "open", "states": { "open": { "final": false }, "sealed": { "final": true } }, "parties": {}, "refs": {},
      "values": {
        "__proto__": { "fixed": false, "required": false, "of": { "type": "text", "max": 64 } },
        "label": { "fixed": false, "required": false, "of": { "type": "record", "of": { "__proto__": { "type": "text", "max": 64, "required": true } } } },
        "checked": { "fixed": false, "required": false, "of": { "type": "text", "max": 64 } }
      }
    }
  },
  "acts": {
    "start": {
      "step": "open", "on": "shelf", "grant": "issue.open", "also": {},
      "fields": {
        "opener": { "type": "member", "required": true }, "title": { "type": "text", "max": 256, "required": true }, "number": { "type": "int", "min": 1, "max": 1000000000, "required": false },
        "body": { "type": "text", "max": 65536, "detached": true, "required": false }, "conditions": { "type": "list", "max": 16, "of": { "type": "text", "max": 4096 }, "required": true }
      },
      "guards": [], "effects": [{ "party": { "slot": "keeper", "from": { "field": "opener" } } }, { "value": { "slot": "title", "from": { "field": "title" } } }],
      "sends": [], "attention": []
    },
    "fill": {
      "step": "open", "on": "jar", "grant": "issue.comment", "also": {},
      "fields": {
        "__proto__": { "type": "text", "max": 64, "required": true },
        "label": { "type": "record", "of": { "__proto__": { "type": "text", "max": 64, "required": true } }, "required": true }
      },
      "guards": [], "effects": [{ "value": { "slot": "__proto__", "from": { "field": "__proto__" } } }, { "value": { "slot": "label", "from": { "field": "label" } } }],
      "sends": [], "attention": []
    },
    "check": {
      "step": "transition", "on": "shelf", "grant": "issue.comment",
      "also": { "__proto__": { "item": "jar", "by": "jar" } },
      "fields": { "jar": { "type": "item", "of": "jar", "required": true }, "title": { "type": "text", "max": 256, "required": true } },
      "guards": [{ "state": ["open"], "of": "also.__proto__" }],
      "effects": [{ "value": { "slot": "title", "from": { "field": "title" } } }],
      "sends": [], "attention": []
    },
    "stock": {
      "step": "open", "on": "jar", "grant": "issue.comment", "also": {},
      "fields": {
        "__proto__": { "type": "text", "max": 64, "required": false },
        "constructor": { "type": "text", "max": 64, "required": false },
        "toString": { "type": "record", "of": { "__proto__": { "type": "text", "max": 64, "required": false } }, "required": false },
        "box": { "type": "record", "of": { "__proto__": { "type": "text", "max": 64, "required": false }, "valueOf": { "type": "text", "max": 64, "required": false } }, "required": true }
      },
      "guards": [], "effects": [], "sends": [], "attention": []
    },
    "close": {
      "step": "transition", "on": "jar", "grant": "issue.comment", "also": {}, "fields": {},
      "presents": { "constructor": { "kind": ["fill"], "under": "pantry", "required": false } },
      "guards": [{ "state": ["open"] }], "effects": [{ "state": "sealed" }],
      "sends": [], "attention": []
    },
    "recheck": {
      "step": "transition", "on": "shelf", "grant": "issue.comment",
      "also": { "__proto__": { "item": "jar", "by": "jar" } },
      "fields": { "jar": { "type": "item", "of": "jar", "required": false, "default": 2 }, "title": { "type": "text", "max": 256, "required": true } },
      "guards": [{ "state": ["open"], "of": "also.__proto__" }],
      "effects": [{ "value": { "slot": "title", "from": { "field": "title" } } }],
      "sends": [], "attention": []
    },
    "glance": {
      "step": "transition", "on": "shelf", "grant": "issue.comment",
      "also": { "__proto__": { "item": "jar", "by": "jar" } },
      "fields": { "jar": { "type": "item", "of": "jar", "required": false }, "title": { "type": "text", "max": 256, "required": true } },
      "guards": [],
      "effects": [{ "value": { "slot": "title", "from": { "field": "title" } } }],
      "sends": [], "attention": []
    },
    "verify": {
      "step": "transition", "on": "shelf", "grant": "issue.comment",
      "also": { "selected": { "item": "jar", "by": "jarFact" } },
      "fields": { "jarFact": { "type": "fact", "kind": ["fill"], "under": "pantry", "required": true }, "title": { "type": "text", "max": 256, "required": true } },
      "guards": [{ "state": ["open"], "of": "also.selected" }],
      "effects": [{ "value": { "slot": "title", "from": { "field": "title" } } }],
      "sends": [], "attention": []
    },
    "shake": {
      "step": "transition", "on": "jar", "grant": "issue.comment", "also": {}, "fields": { "note": { "type": "text", "max": 64, "required": true } },
      "guards": [{ "state": ["open"] }], "effects": [{ "value": { "slot": "checked", "from": { "field": "note" } } }], "sends": [], "attention": []
    },
    "seal": {
      "step": "transition", "on": "jar", "grant": "issue.comment", "also": {}, "fields": {},
      "presents": { "__proto__": { "kind": ["fill"], "under": "pantry", "required": true } },
      "guards": [{ "state": ["open"] }, { "fact": { "presented": "__proto__" }, "reason": "no-fill" }, { "equals": { "a": { "presented": "__proto__", "part": "seq" }, "b": { "item": "on" } }, "reason": "another-jar" }],
      "effects": [{ "state": "sealed" }],
      "sends": [], "attention": []
    }
  },
  "receives": {}, "timed": {}, "rules": {}
}`) as DeclaredDefinition;
