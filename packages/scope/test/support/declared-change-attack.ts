/** Proposed security witness only. Arbitrary capability-free app; no native entry or grant is fabricated. */
import type { DeclaredDefinition } from "@generalbusiness/dap-contract";

export const declaredChangeAttack = {
  "format": "artroom-definition-1",
  "name": "change",
  "profile": {
    "name": "restricted",
    "version": 1
  },
  "capabilities": [],
  "genesis": "establish",
  "items": {
    "configuration": {
      "many": false,
      "max": 1,
      "initial": "ready",
      "states": {
        "ready": {
          "final": false
        }
      },
      "parties": {
        "opener": {
          "fixed": true,
          "required": true,
          "list": false,
          "author": false
        }
      },
      "refs": {
        "destination": {
          "fixed": true,
          "required": true,
          "to": {
            "type": "scope",
            "kind": "destination"
          }
        }
      },
      "values": {}
    },
    "manifest": {
      "many": true,
      "max": 16,
      "initial": "ready",
      "states": {
        "ready": {
          "final": false
        }
      },
      "parties": {
        "integrator": {
          "fixed": true,
          "required": true,
          "list": false,
          "author": true
        }
      },
      "refs": {},
      "values": {
        "base": {
          "fixed": true,
          "required": true,
          "of": {
            "type": "commit"
          }
        },
        "digest": {
          "fixed": true,
          "required": true,
          "of": {
            "type": "digest"
          }
        },
        "path": {
          "fixed": true,
          "required": true,
          "of": {
            "max": 1024,
            "type": "text"
          }
        },
        "size": {
          "fixed": true,
          "required": true,
          "of": {
            "max": 65536,
            "min": 0,
            "type": "int"
          }
        }
      }
    },
    "merge": {
      "many": true,
      "max": 16,
      "initial": "ready",
      "states": {
        "ready": {
          "final": false
        }
      },
      "parties": {},
      "refs": {},
      "values": {}
    }
  },
  "acts": {
    "establish": {
      "step": "open",
      "also": {},
      "fields": {
        "opener": {
          "type": "member",
          "required": true
        },
        "destination": {
          "type": "scope",
          "kind": "destination",
          "required": true
        }
      },
      "guards": [],
      "effects": [
        {
          "party": {
            "slot": "opener",
            "from": {
              "field": "opener"
            }
          }
        },
        {
          "ref": {
            "slot": "destination",
            "from": {
              "field": "destination"
            }
          }
        }
      ],
      "sends": [],
      "attention": [],
      "on": "configuration",
      "grant": "application.establish"
    },
    "propose-file": {
      "step": "open",
      "also": {},
      "fields": {
        "base": {
          "required": true,
          "type": "commit"
        },
        "content": {
          "max": 65536,
          "required": true,
          "type": "text"
        },
        "digest": {
          "required": true,
          "type": "digest"
        },
        "path": {
          "max": 1024,
          "required": true,
          "type": "text"
        },
        "size": {
          "max": 65536,
          "min": 0,
          "required": true,
          "type": "int"
        }
      },
      "guards": [],
      "effects": [
        {
          "party": {
            "slot": "integrator",
            "from": {
              "signer": true
            }
          }
        },
        {
          "value": {
            "slot": "base",
            "from": {
              "field": "base"
            }
          }
        },
        {
          "value": {
            "slot": "digest",
            "from": {
              "field": "digest"
            }
          }
        },
        {
          "value": {
            "slot": "path",
            "from": {
              "field": "path"
            }
          }
        },
        {
          "value": {
            "slot": "size",
            "from": {
              "field": "size"
            }
          }
        }
      ],
      "sends": [],
      "attention": [],
      "on": "manifest",
      "grant": "change.propose"
    },
    "merge": {
      "step": "open",
      "also": {
        "manifest": {
          "item": "manifest",
          "by": "manifest"
        },
        "configuration": {
          "item": "configuration",
          "one": true
        }
      },
      "fields": {
        "manifest": {
          "type": "item",
          "of": "manifest",
          "required": true
        }
      },
      "guards": [],
      "effects": [],
      "sends": [
        {
          "tell": {
            "to": {
              "slot": "destination",
              "of": "also.configuration"
            },
            "message": "reserve",
            "fields": {
              "operation": "self",
              "manifest": {
                "item": "also.manifest"
              },
              "verdicts": {
                "const": []
              },
              "jobs": {
                "const": []
              },
              "links": {
                "const": []
              },
              "reports": {
                "const": []
              }
            },
            "result": {}
          }
        }
      ],
      "attention": [],
      "on": "merge",
      "grant": "change.merge"
    }
  },
  "receives": {},
  "timed": {},
  "rules": {}
} satisfies DeclaredDefinition;
