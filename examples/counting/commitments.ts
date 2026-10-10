/** Draft 4 counting commitments, using existing declaration forms only. */
import type { DeclaredDefinition } from "@generalbusiness/artroom-contract";

export const countingCommitments: DeclaredDefinition = {
  "format": "artroom-definition-1",
  "name": "counting-commitments",
  "profile": {"name": "restricted", "version": 1},
  "capabilities": [],
  "genesis": "establish",
  "items": {
    "configuration": {
      "many": false,
      "max": 1,
      "states": {"ready": {"final": false}},
      "initial": "ready",
      "parties": {"controller": {"fixed": true, "required": true, "list": false, "author": false}},
      "refs": {},
      "values": {"target": {"fixed": true, "required": true, "of": {"type": "int", "min": 1, "max": 100}}}
    },
    "board": {
      "many": false,
      "max": 1,
      "states": {"paused": {"final": false}, "open": {"final": false}, "finished": {"final": false}},
      "initial": "paused",
      "parties": {
        "controller": {"fixed": true, "required": true, "list": false, "author": false},
        "lastSpeaker": {"fixed": false, "required": false, "list": false, "author": false}
      },
      "refs": {
        "pledge": {"fixed": false, "required": false, "to": {"type": "item", "of": "promise"}},
        "lastFulfilledAt": {
          "fixed": false,
          "required": false,
          "to": {"type": "fact", "under": "counting-commitments", "kind": ["fulfill"]}
        }
      },
      "values": {
        "target": {"fixed": true, "required": true, "of": {"type": "int", "min": 1, "max": 100}},
        "generation": {"fixed": false, "required": true, "of": {"type": "int", "min": 0, "max": 1000000}, "default": 0},
        "serial": {"fixed": false, "required": true, "of": {"type": "int", "min": 0, "max": 1000000}, "default": 0},
        "lastNumber": {"fixed": false, "required": true, "of": {"type": "int", "min": 0, "max": 100}, "default": 0},
        "until": {"fixed": false, "required": false, "of": {"type": "time"}}
      }
    },
    "participant": {
      "many": true,
      "max": 16,
      "states": {"inactive": {"final": false}, "active": {"final": false}, "removed": {"final": true}},
      "initial": "inactive",
      "parties": {"agent": {"fixed": true, "required": true, "list": false, "author": false}},
      "refs": {},
      "values": {}
    },
    "promise": {
      "many": true,
      "max": 1,
      "states": {
        "pledged": {"final": false},
        "fulfilled": {"final": true},
        "failed": {"final": true},
        "cancelled": {"final": true},
        "expired": {"final": true}
      },
      "initial": "pledged",
      "parties": {"agent": {"fixed": true, "required": true, "list": false, "author": false}},
      "refs": {
        "participant": {"fixed": true, "required": true, "to": {"type": "item", "of": "participant"}},
        "admittedAt": {
          "fixed": true,
          "required": true,
          "to": {"type": "fact", "under": "counting-commitments", "kind": ["commit"]}
        }
      },
      "values": {
        "n": {"fixed": true, "required": true, "of": {"type": "int", "min": 1, "max": 100}},
        "generation": {"fixed": true, "required": true, "of": {"type": "int", "min": 0, "max": 1000000}},
        "serial": {"fixed": true, "required": true, "of": {"type": "int", "min": 1, "max": 1000000}},
        "basis": {
          "fixed": true,
          "required": true,
          "of": {
            "type": "list",
            "max": 16,
            "of": {
              "type": "record",
              "of": {
                "id": {"type": "item", "of": "participant", "required": true},
                "member": {"type": "member", "required": true}
              }
            }
          }
        },
        "until": {"fixed": true, "required": true, "of": {"type": "time"}},
        "reason": {
          "fixed": false,
          "required": false,
          "of": {"type": "enum", "of": ["media-error", "process-error", "cancelled", "interrupted", "speech-uncertain"]}
        }
      }
    }
  },
  "acts": {
    "establish": {
      "step": "open",
      "on": "configuration",
      "grant": "counting.establish",
      "also": {},
      "fields": {
        "opener": {"type": "member", "required": true},
        "target": {"type": "int", "min": 1, "max": 100, "required": true}
      },
      "guards": [],
      "effects": [
        {"party": {"slot": "controller", "from": {"field": "opener"}}},
        {"value": {"slot": "target", "from": {"field": "target"}}}
      ],
      "sends": [],
      "attention": []
    },
    "initialize": {
      "step": "open",
      "on": "board",
      "grant": "counting.control",
      "also": {"configuration": {"item": "configuration", "one": true}},
      "fields": {},
      "guards": [{"state": ["ready"], "of": "also.configuration"}, {"signer": ["controller"], "of": "also.configuration"}],
      "effects": [
        {"party": {"slot": "controller", "from": {"slot": "controller", "of": "also.configuration"}}},
        {"value": {"slot": "target", "from": {"slot": "target", "of": "also.configuration"}}}
      ],
      "sends": [],
      "attention": []
    },
    "participate": {
      "step": "open",
      "on": "participant",
      "grant": "counting.participate",
      "also": {},
      "fields": {},
      "guards": [
        {
          "none": {
            "type": "participant",
            "states": ["inactive", "active"],
            "where": [{"equals": {"a": {"slot": "agent"}, "b": {"signer": true}}}]
          }
        }
      ],
      "effects": [{"party": {"slot": "agent", "from": {"signer": true}}}],
      "sends": [],
      "attention": []
    },
    "activate": {
      "step": "transition",
      "on": "participant",
      "grant": "counting.activity",
      "also": {},
      "fields": {},
      "guards": [{"state": ["inactive"]}, {"signer": ["agent"]}],
      "effects": [{"state": "active"}],
      "sends": [],
      "attention": []
    },
    "deactivate": {
      "step": "transition",
      "on": "participant",
      "grant": "counting.activity",
      "also": {},
      "fields": {},
      "guards": [
        {"state": ["active"]},
        {"signer": ["agent"]},
        {
          "none": {
            "type": "promise",
            "states": ["pledged"],
            "where": [{"equals": {"a": {"slot": "agent"}, "b": {"slot": "agent", "of": "on"}}}]
          }
        }
      ],
      "effects": [{"state": "inactive"}],
      "sends": [],
      "attention": []
    },
    "force-deactivate": {
      "step": "transition",
      "on": "participant",
      "grant": "counting.control",
      "also": {"configuration": {"item": "configuration", "one": true}},
      "fields": {},
      "guards": [
        {"state": ["active"]},
        {"signer": ["controller"], "of": "also.configuration"},
        {"differs": {"a": {"signer": true}, "b": {"slot": "agent"}}},
        {
          "none": {
            "type": "promise",
            "states": ["pledged"],
            "where": [{"equals": {"a": {"slot": "agent"}, "b": {"slot": "agent", "of": "on"}}}]
          }
        }
      ],
      "effects": [{"state": "inactive"}],
      "sends": [],
      "attention": []
    },
    "remove-participant": {
      "step": "transition",
      "on": "participant",
      "grant": "counting.control",
      "also": {"configuration": {"item": "configuration", "one": true}},
      "fields": {},
      "guards": [
        {"state": ["inactive"]},
        {"signer": ["controller"], "of": "also.configuration"},
        {
          "none": {
            "type": "promise",
            "states": ["pledged"],
            "where": [{"equals": {"a": {"slot": "agent"}, "b": {"slot": "agent", "of": "on"}}}]
          }
        }
      ],
      "effects": [{"state": "removed"}],
      "sends": [],
      "attention": []
    },
    "start": {
      "step": "transition",
      "on": "board",
      "grant": "counting.control",
      "also": {},
      "fields": {},
      "guards": [
        {"state": ["paused"]},
        {"signer": ["controller"]},
        {"unset": "pledge"},
        {"none": {"type": "promise", "states": ["pledged"]}},
        {"rule": "start-plan"}
      ],
      "effects": [{"state": "open"}],
      "sends": [],
      "attention": []
    },
    "commit": {
      "step": "open",
      "on": "promise",
      "grant": "counting.commit",
      "also": {"board": {"item": "board", "one": true}, "participant": {"item": "participant", "by": "participant"}},
      "fields": {
        "participant": {"type": "item", "of": "participant", "required": true},
        "generation": {"type": "int", "min": 0, "max": 1000000, "required": true},
        "serial": {"type": "int", "min": 1, "max": 1000000, "required": true},
        "n": {"type": "int", "min": 1, "max": 100, "required": true},
        "basis": {
          "type": "list",
          "max": 16,
          "of": {
            "type": "record",
            "of": {
              "id": {"type": "item", "of": "participant", "required": true},
              "member": {"type": "member", "required": true}
            }
          },
          "required": true
        }
      },
      "guards": [
        {"state": ["open"], "of": "also.board"},
        {"of": "also.board", "unset": "pledge"},
        {"none": {"type": "promise", "states": ["pledged"]}},
        {"state": ["active"], "of": "also.participant"},
        {"of": "also.participant", "signer": ["agent"]},
        {
          "sameSet": {
            "list": {"field": "basis"},
            "as": "p",
            "key": {"element": "p.id"},
            "items": {"type": "participant", "states": ["active"]},
            "match": [{"equals": {"a": {"slot": "agent"}, "b": {"element": "p.member"}}}],
            "ordered": true
          }
        },
        {
          "anyOf": [
            [{"count": {"type": "participant", "states": ["active"], "max": 1}}],
            [{"differs": {"a": {"signer": true}, "b": {"slot": "lastSpeaker", "of": "also.board"}}}]
          ]
        },
        {"rule": "commit-plan"}
      ],
      "effects": [
        {"party": {"slot": "agent", "from": {"signer": true}}},
        {"ref": {"slot": "participant", "from": {"item": "also.participant"}}},
        {"ref": {"slot": "admittedAt", "from": "self"}},
        {"value": {"slot": "n", "from": {"field": "n"}}},
        {"value": {"slot": "generation", "from": {"field": "generation"}}},
        {"value": {"slot": "serial", "from": {"field": "serial"}}},
        {"value": {"slot": "basis", "from": {"field": "basis"}}},
        {"value": {"slot": "until", "from": {"time": {"plusSeconds": 30}}}},
        {"value": {"slot": "serial", "from": {"field": "serial"}}, "of": "also.board"},
        {"ref": {"slot": "pledge", "from": "self"}, "of": "also.board"},
        {"value": {"slot": "until", "from": {"time": {"plusSeconds": 30}}}, "of": "also.board"}
      ],
      "sends": [],
      "attention": []
    },
    "fulfill": {
      "step": "transition",
      "on": "promise",
      "grant": "counting.fulfill",
      "also": {"board": {"item": "board", "one": true}},
      "fields": {
        "generation": {"type": "int", "min": 0, "max": 1000000, "required": true},
        "serial": {"type": "int", "min": 1, "max": 1000000, "required": true},
        "n": {"type": "int", "min": 1, "max": 100, "required": true}
      },
      "guards": [
        {"state": ["pledged"]},
        {"state": ["open"], "of": "also.board"},
        {"equals": {"a": {"slot": "pledge", "of": "also.board"}, "b": {"item": "on"}}},
        {"rule": "resolution-plan"},
        {"signer": ["agent"]},
        {"before": {"slot": "until"}}
      ],
      "effects": [
        {"state": "fulfilled"},
        {"value": {"slot": "lastNumber", "from": {"field": "n"}}, "of": "also.board"},
        {"party": {"slot": "lastSpeaker", "from": {"slot": "agent", "of": "on"}}, "of": "also.board"},
        {"ref": {"slot": "lastFulfilledAt", "from": "self"}, "of": "also.board"},
        {"ref": {"slot": "pledge", "from": null}, "of": "also.board"},
        {"value": {"slot": "until", "from": null}, "of": "also.board"},
        {
          "of": "also.board",
          "state": "finished",
          "if": [{"equals": {"a": {"field": "n"}, "b": {"slot": "target", "of": "also.board"}}}]
        },
        {
          "of": "also.board",
          "state": "open",
          "unless": [{"equals": {"a": {"field": "n"}, "b": {"slot": "target", "of": "also.board"}}}]
        }
      ],
      "sends": [],
      "attention": [],
      "settles": {"of": "on", "in": ["pledged"]}
    },
    "fail": {
      "step": "transition",
      "on": "promise",
      "grant": "counting.fail",
      "also": {"board": {"item": "board", "one": true}},
      "fields": {
        "generation": {"type": "int", "min": 0, "max": 1000000, "required": true},
        "serial": {"type": "int", "min": 1, "max": 1000000, "required": true},
        "n": {"type": "int", "min": 1, "max": 100, "required": true},
        "reason": {
          "type": "enum",
          "of": ["media-error", "process-error", "cancelled", "interrupted", "speech-uncertain"],
          "required": true
        }
      },
      "guards": [
        {"state": ["pledged"]},
        {"state": ["open"], "of": "also.board"},
        {"equals": {"a": {"slot": "pledge", "of": "also.board"}, "b": {"item": "on"}}},
        {"rule": "resolution-plan"},
        {"signer": ["agent"]}
      ],
      "effects": [
        {"state": "failed"},
        {"value": {"slot": "reason", "from": {"field": "reason"}}},
        {"of": "also.board", "state": "paused"},
        {"ref": {"slot": "pledge", "from": null}, "of": "also.board"},
        {"value": {"slot": "until", "from": null}, "of": "also.board"}
      ],
      "sends": [],
      "attention": [],
      "settles": {"of": "on", "in": ["pledged"]}
    },
    "cancel": {
      "step": "transition",
      "on": "promise",
      "grant": "counting.control",
      "also": {"board": {"item": "board", "one": true}},
      "fields": {
        "generation": {"type": "int", "min": 0, "max": 1000000, "required": true},
        "serial": {"type": "int", "min": 1, "max": 1000000, "required": true},
        "n": {"type": "int", "min": 1, "max": 100, "required": true}
      },
      "guards": [
        {"state": ["pledged"]},
        {"state": ["open"], "of": "also.board"},
        {"equals": {"a": {"slot": "pledge", "of": "also.board"}, "b": {"item": "on"}}},
        {"rule": "resolution-plan"},
        {"of": "also.board", "signer": ["controller"]}
      ],
      "effects": [
        {"state": "cancelled"},
        {"value": {"slot": "reason", "from": {"const": "cancelled"}}},
        {"of": "also.board", "state": "paused"},
        {"ref": {"slot": "pledge", "from": null}, "of": "also.board"},
        {"value": {"slot": "until", "from": null}, "of": "also.board"}
      ],
      "sends": [],
      "attention": [],
      "settles": {"of": "on", "in": ["pledged"]}
    },
    "pause": {
      "step": "transition",
      "on": "board",
      "grant": "counting.control",
      "also": {},
      "fields": {},
      "guards": [
        {"state": ["open"]},
        {"signer": ["controller"]},
        {"unset": "pledge"},
        {"none": {"type": "promise", "states": ["pledged"]}}
      ],
      "effects": [{"state": "paused"}, {"ref": {"slot": "pledge", "from": null}}, {"value": {"slot": "until", "from": null}}],
      "sends": [],
      "attention": []
    },
    "reset": {
      "step": "transition",
      "on": "board",
      "grant": "counting.control",
      "also": {},
      "fields": {"generation": {"type": "int", "min": 1, "max": 1000000, "required": true}},
      "guards": [
        {"state": ["paused", "finished"]},
        {"signer": ["controller"]},
        {"unset": "pledge"},
        {"none": {"type": "promise", "states": ["pledged"]}},
        {"rule": "reset-plan"}
      ],
      "effects": [
        {"state": "paused"},
        {"value": {"slot": "generation", "from": {"field": "generation"}}},
        {"value": {"slot": "serial", "from": {"const": 0}}},
        {"value": {"slot": "lastNumber", "from": {"const": 0}}},
        {"party": {"slot": "lastSpeaker", "from": null}},
        {"ref": {"slot": "lastFulfilledAt", "from": null}},
        {"ref": {"slot": "pledge", "from": null}},
        {"value": {"slot": "until", "from": null}}
      ],
      "sends": [],
      "attention": []
    }
  },
  "receives": {},
  "timed": {
    "commitment-expired": {
      "on": "board",
      "states": ["open"],
      "deadline": "until",
      "effects": [{"state": "paused"}, {"ref": {"slot": "pledge", "from": null}}, {"value": {"slot": "until", "from": null}}],
      "attention": []
    },
    "promise-expired": {
      "on": "promise",
      "states": ["pledged"],
      "deadline": "until",
      "effects": [{"state": "expired"}],
      "attention": []
    }
  },
  "rules": {
    "start-plan": "subjects.on.values.lastNumber < subjects.on.values.target",
    "commit-plan": "($b := $lookup(subjects,\"also.board\"); $p := $lookup(subjects,\"also.participant\"); $exists($b) and $exists($p) and fields.generation = $b.values.generation and fields.serial = $b.values.serial + 1 and fields.n = $b.values.lastNumber + 1 and fields.n <= $b.values.target)",
    "resolution-plan": "($b := $lookup(subjects,\"also.board\"); $v := subjects.on.values; $exists($b) and fields.generation = $v.generation and fields.generation = $b.values.generation and fields.serial = $v.serial and fields.serial = $b.values.serial and fields.n = $v.n and fields.n = $b.values.lastNumber + 1 and fields.n <= $b.values.target)",
    "reset-plan": "fields.generation = subjects.on.values.generation + 1"
  }
};

/** No create sends: the complete declared closure is this definition alone. */
export const countingCommitmentsClosure: readonly DeclaredDefinition[] = [countingCommitments];
