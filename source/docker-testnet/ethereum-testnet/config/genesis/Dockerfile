FROM ethpandaops/ethereum-genesis-generator:5.2.2

# Install dependencies
USER root
RUN apt-get update && apt-get install -y bash openssl curl && rm -rf /var/lib/apt/lists/*

# Copy binaries from official images
COPY --from=ethereum/client-go:v1.13.14 /usr/local/bin/geth /usr/local/bin/geth
COPY --from=sigp/lighthouse:v5.3.0 /usr/local/bin/lighthouse /usr/local/bin/lighthouse

WORKDIR /work

COPY generate.sh /generate.sh
RUN chmod +x /generate.sh

ENTRYPOINT ["/bin/bash", "/generate.sh"]
