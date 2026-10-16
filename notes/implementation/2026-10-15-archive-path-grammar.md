# Archive path grammar

This internal foundation covers A1a child `09896c35`, promise `0c82a707`,
under durability request `e871ba09` and checker decision `e9e0094c`.
It implements the names in section 15.4 of the reviewed durability design.
It does not enable an archive or complete A1.

The codec keeps the native `sc_` scope spelling in journal refs. Value
domains use `d_` and canonical lowercase base32 of their exact UTF-8 bytes.
A domain of at most 158 bytes fits the 255-byte segment limit. Longer
names are refused, never truncated or replaced with a hash. The decoder
rejects alternate padding bits and invalid UTF-8, and preserves a leading
byte-order mark as data. Traversal characters, slashes and NULs inside a
valid domain are encoded as bytes.

Retained names support only definition, entry, rule, snapshot and value.
They require the native SHA256 digest spelling. Texts and unknown kinds
are refused. Segments use one twelve-digit decimal position. Parsing
accepts only those exact logical paths. The functions stay internal to
the Git package, with no package or barrel export.

Four focused plain-function tests passed. They cover exact hostile and
Unicode round trips, the byte boundary, noncanonical spellings, invalid
retained names and native scope/segment grammar. Git source and test
compilers passed after correcting the ref encoder's input type to accept
an untrusted value. The final gate result is filed separately.

These functions name files. They read, disclose, authorize and export no
entry or retained input. A later layout must apply directory fan-out and
validate filesystem modes. Manifest dependency inventory, privacy
omissions, object/commit layout, archive writer, clone replay and progress
remain owed. An encoded domain does not grant permission to export its
bytes. No provider operation ran.
