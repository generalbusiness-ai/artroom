# Captured smart-HTTP responses of the hosting's own Git service

Captured by the planner on 2026-10-07 at 11:36 Eastern from the live
repository `artroom-demo/lm2piehzm5ujqyctjecrjthjwcg73u2v5ryz4gyqehvrlglyzrfa-1`
(the founding commit 517e108 with an empty tree, and the receipt ref), with a
read token in an `Authorization: Bearer` header. No token is in these files.

- `info-refs.bin`: `GET /info/refs?service=git-upload-pack`, 200,
  `application/x-git-upload-pack-advertisement`. Capabilities include
  side-band, side-band-64k, no-done, allow-tip-sha1-in-want, no-progress;
  not ofs-delta.
- `request-v0.bin`: the request body sent, `0032want <head>\n0000` then
  `0009done\n`, with no capabilities.
- `upload-pack.bin`: `POST /git-upload-pack`, 200,
  `application/x-git-upload-pack-result`: `0008NAK\n`, then a raw pack of
  2 objects (364 bytes including its 20-byte trailer), then a flush
  packet `0000`. The pack's trailer verifies once the trailing `0000` is
  left out; `git index-pack` accepts the trimmed pack. The read client
  counted the flush packet as pack bytes and refused `hash-mismatch: pack
  trailer`.
