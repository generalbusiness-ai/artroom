# Real git for merge previews and landing. Nothing else.
FROM debian:trixie-slim

RUN apt-get update \
	&& apt-get install --yes --no-install-recommends ca-certificates git \
	&& rm -rf /var/lib/apt/lists/*

CMD ["sleep", "infinity"]
