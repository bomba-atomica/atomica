FROM ethpandaops/ethereum-genesis-generator:5.2.2

# Install dependencies (Debian based)
USER root
RUN apt-get update && apt-get install -y bash openssl && rm -rf /var/lib/apt/lists/*

COPY generate.sh /generate.sh
RUN chmod +x /generate.sh

ENTRYPOINT ["/bin/bash", "/generate.sh"]
