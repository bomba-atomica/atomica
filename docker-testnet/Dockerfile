# Zapatos Validator Node - Multi-stage build
#
# This Dockerfile builds the aptos-node binary from zapatos source in a
# consistent environment and creates a minimal runtime image.
#
# Build args:
#   ZAPATOS_REPO: Git repository URL (default: local ../source/zapatos)
#   ZAPATOS_REF: Git ref to build (commit, branch, tag)
#   PROFILE: Rust build profile (release or debug)

# Stage 1: Build the aptos-node binary
FROM rust:1.75-bullseye AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    cmake \
    clang \
    libssl-dev \
    pkg-config \
    libpq-dev \
    lld \
    && rm -rf /var/lib/apt/lists/*

# Set up build environment
WORKDIR /build

# Accept build arguments
ARG ZAPATOS_REPO=local
ARG ZAPATOS_REF=HEAD
ARG PROFILE=release

# Copy or clone zapatos source
# For local builds: source is copied from context (source/zapatos/)
# For git builds: clone from repository
COPY source/zapatos /build/zapatos

# If building from git repo instead of local source
RUN if [ "$ZAPATOS_REPO" != "local" ]; then \
        echo "Cloning zapatos from $ZAPATOS_REPO (ref: $ZAPATOS_REF)"; \
        rm -rf /build/zapatos; \
        git clone "$ZAPATOS_REPO" /build/zapatos && \
        cd /build/zapatos && \
        git checkout "$ZAPATOS_REF"; \
    else \
        echo "Using local zapatos source from context"; \
    fi

WORKDIR /build/zapatos

# Get git commit for metadata
RUN GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown") && \
    echo "Building zapatos commit: $GIT_SHA" && \
    echo "$GIT_SHA" > /build/git-commit.txt

# Build aptos-node binary
RUN if [ "$PROFILE" = "release" ]; then \
        cargo build --release --bin aptos-node; \
        cp target/release/aptos-node /build/aptos-node; \
    else \
        cargo build --bin aptos-node; \
        cp target/debug/aptos-node /build/aptos-node; \
    fi

# Verify binary was built
RUN ls -lh /build/aptos-node && \
    /build/aptos-node --version

# Stage 2: Runtime image (minimal)
FROM debian:bullseye-slim

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl1.1 \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create aptos user
RUN groupadd -g 6180 aptos && \
    useradd -u 6180 -g aptos -s /bin/bash -m aptos

# Copy binary from builder
COPY --from=builder /build/aptos-node /usr/local/bin/aptos-node
COPY --from=builder /build/git-commit.txt /etc/zapatos-commit

# Set permissions
RUN chmod +x /usr/local/bin/aptos-node

# Create data directory
RUN mkdir -p /opt/aptos/var && \
    chown -R aptos:aptos /opt/aptos

# Add build metadata
ARG BUILD_DATE
ARG GIT_SHA
ENV BUILD_DATE=${BUILD_DATE}
ENV GIT_SHA=${GIT_SHA}
ENV ZAPATOS_COMMIT=$(cat /etc/zapatos-commit 2>/dev/null || echo "unknown")

# Expose ports
EXPOSE 6180 6181 6182 8080 9101

# Set working directory
WORKDIR /opt/aptos

# Run as aptos user
USER aptos

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8080/v1 || exit 1

# Default command
ENTRYPOINT ["/usr/local/bin/aptos-node"]
CMD ["--help"]
