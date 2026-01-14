FROM ethpandaops/ethereum-genesis-generator:5.2.2

# Install dependencies (Alpine based)
RUN apk add --no-cache bash openssl


COPY generate.sh /generate.sh


RUN chmod +x /generate.sh

ENTRYPOINT ["/bin/bash", "/generate.sh"]
