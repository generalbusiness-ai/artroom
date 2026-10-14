/** The lending library of notes/2026-10-13-lending-library.md, using existing declaration forms only. */
import type { DeclaredDefinition } from "@generalbusiness/dap-contract";

export const lending: DeclaredDefinition = {
  "format": "artroom-definition-1",
  "name": "lending",
  "profile": {
    "name": "restricted",
    "version": 1
  },
  "capabilities": [],
  "genesis": "establish",
  "items": {
    "library": {
      "many": false,
      "max": 1,
      "states": {
        "open": {
          "final": false
        }
      },
      "initial": "open",
      "parties": {
        "founder": {
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
    "thing": {
      "many": true,
      "max": 64,
      "states": {
        "available": {
          "final": false
        },
        "lent": {
          "final": false
        },
        "gone": {
          "final": true
        }
      },
      "initial": "available",
      "parties": {
        "donor": {
          "fixed": true,
          "required": true,
          "list": false,
          "author": false
        },
        "borrower": {
          "fixed": false,
          "required": false,
          "list": false,
          "author": false
        }
      },
      "refs": {},
      "values": {
        "name": {
          "fixed": true,
          "required": true,
          "of": {
            "type": "text",
            "max": 80
          }
        },
        "description": {
          "fixed": true,
          "required": true,
          "of": {
            "type": "text",
            "max": 1000
          }
        },
        "reason": {
          "fixed": false,
          "required": false,
          "of": {
            "type": "text",
            "max": 280
          }
        },
        "page": {
          "fixed": true,
          "required": true,
          "of": {
            "type": "text",
            "max": 1024
          }
        }
      }
    }
  },
  "acts": {
    "establish": {
      "step": "open",
      "on": "library",
      "grant": "lending.establish",
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
            "slot": "founder",
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
      "attention": []
    },
    "donate": {
      "step": "open",
      "on": "thing",
      "grant": "lending.member",
      "also": {
        "library": {
          "item": "library",
          "one": true
        }
      },
      "fields": {
        "name": {
          "type": "text",
          "max": 80,
          "required": true
        },
        "description": {
          "type": "text",
          "max": 1000,
          "required": true
        },
        "content": {
          "type": "text",
          "max": 4096,
          "required": true
        },
        "page": {
          "type": "text",
          "max": 1024,
          "required": true
        }
      },
      "guards": [
        {
          "rule": "shelf-page"
        },
        {
          "none": {
            "type": "thing",
            "states": [
              "available",
              "lent",
              "gone"
            ],
            "where": [
              {
                "equals": {
                  "a": {
                    "slot": "page"
                  },
                  "b": {
                    "field": "page"
                  }
                }
              }
            ]
          }
        }
      ],
      "effects": [
        {
          "party": {
            "slot": "donor",
            "from": {
              "signer": true
            }
          }
        },
        {
          "value": {
            "slot": "name",
            "from": {
              "field": "name"
            }
          }
        },
        {
          "value": {
            "slot": "description",
            "from": {
              "field": "description"
            }
          }
        },
        {
          "value": {
            "slot": "page",
            "from": {
              "field": "page"
            }
          }
        }
      ],
      "sends": [
        {
          "tell": {
            "to": {
              "slot": "destination",
              "of": "also.library"
            },
            "message": "publish-file",
            "fields": {
              "path": {
                "field": "page"
              },
              "content": {
                "field": "content"
              }
            },
            "result": {}
          }
        }
      ],
      "attention": []
    },
    "borrow": {
      "step": "transition",
      "on": "thing",
      "grant": "lending.member",
      "also": {
        "library": {
          "item": "library",
          "one": true
        }
      },
      "fields": {
        "content": {
          "type": "text",
          "max": 4096,
          "required": true
        }
      },
      "guards": [
        {
          "state": [
            "available"
          ]
        }
      ],
      "effects": [
        {
          "state": "lent"
        },
        {
          "party": {
            "slot": "borrower",
            "from": {
              "signer": true
            }
          }
        }
      ],
      "sends": [
        {
          "tell": {
            "to": {
              "slot": "destination",
              "of": "also.library"
            },
            "message": "publish-file",
            "fields": {
              "path": {
                "slot": "page"
              },
              "content": {
                "field": "content"
              }
            },
            "result": {}
          }
        }
      ],
      "attention": []
    },
    "return": {
      "step": "transition",
      "on": "thing",
      "grant": "lending.member",
      "also": {
        "library": {
          "item": "library",
          "one": true
        }
      },
      "fields": {
        "content": {
          "type": "text",
          "max": 4096,
          "required": true
        }
      },
      "guards": [
        {
          "state": [
            "lent"
          ]
        }
      ],
      "effects": [
        {
          "state": "available"
        },
        {
          "party": {
            "slot": "borrower",
            "from": null
          }
        }
      ],
      "sends": [
        {
          "tell": {
            "to": {
              "slot": "destination",
              "of": "also.library"
            },
            "message": "publish-file",
            "fields": {
              "path": {
                "slot": "page"
              },
              "content": {
                "field": "content"
              }
            },
            "result": {}
          }
        }
      ],
      "attention": []
    },
    "cancel": {
      "step": "transition",
      "on": "thing",
      "grant": "lending.staff",
      "also": {
        "library": {
          "item": "library",
          "one": true
        }
      },
      "fields": {
        "reason": {
          "type": "text",
          "max": 280,
          "required": true
        },
        "content": {
          "type": "text",
          "max": 4096,
          "required": true
        }
      },
      "guards": [
        {
          "state": [
            "available",
            "lent"
          ]
        }
      ],
      "effects": [
        {
          "state": "gone"
        },
        {
          "value": {
            "slot": "reason",
            "from": {
              "field": "reason"
            }
          }
        },
        {
          "party": {
            "slot": "borrower",
            "from": null
          }
        }
      ],
      "sends": [
        {
          "tell": {
            "to": {
              "slot": "destination",
              "of": "also.library"
            },
            "message": "publish-file",
            "fields": {
              "path": {
                "slot": "page"
              },
              "content": {
                "field": "content"
              }
            },
            "result": {}
          }
        }
      ],
      "attention": []
    },
    "publish": {
      "step": "transition",
      "on": "library",
      "grant": "lending.member",
      "also": {
        "thing": {
          "item": "thing",
          "by": "thing"
        }
      },
      "fields": {
        "thing": {
          "type": "item",
          "of": "thing",
          "required": true
        },
        "content": {
          "type": "text",
          "max": 4096,
          "required": true
        }
      },
      "guards": [],
      "effects": [],
      "sends": [
        {
          "tell": {
            "to": {
              "slot": "destination"
            },
            "message": "publish-file",
            "fields": {
              "path": {
                "slot": "page",
                "of": "also.thing"
              },
              "content": {
                "field": "content"
              }
            },
            "result": {}
          }
        }
      ],
      "attention": []
    }
  },
  "receives": {},
  "timed": {},
  "rules": {
    "shelf-page": "$substring(fields.page, 0, 6) = \"shelf/\" and $substring(fields.page, -3) = \".md\" and $not($contains(fields.page, \"..\"))"
  }
};

/** No create sends: the complete declared closure is this definition alone. */
export const lendingClosure: readonly DeclaredDefinition[] = [lending];
