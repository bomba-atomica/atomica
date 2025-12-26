# Zapatos Validator Node - Multi-stage build with cache mounts
#
# This Dockerfile builds aptos-node in a Debian Bullseye environment
# to ensure binary compatibility with the runtime image.
# Uses BuildKit cache mounts for fast incremental builds.
#
# Build context: repository root (for source/zapatos access)
# Requires: Docker BuildKit enabled (DOCKER_BUILDKIT=1)
#
# Build args:
#   BUILD_DATE: Build timestamp
#   GIT_SHA: Zapatos git commit hash
#   PROFILE: Build profile (release or debug, default: release)

# Stage 1: Build the aptos-node binary
FROM rust:1.75-bullseye AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    clang \
    libssl-dev \
    pkg-config \
    libpq-dev \
    lld \
    libudev-dev \
    libdw-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy zapatos source
COPY source/zapatos /build/zapatos

WORKDIR /build/zapatos

# Print the git commit being built
ARG GIT_SHA
RUN echo "Building Zapatos from commit: ${GIT_SHA}"


# Build with cargo cache mount for fast incremental builds
ARG PROFILE=release
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/build/zapatos/target,sharing=locked \
    if [ "$PROFILE" = "release" ]; then \
        cargo build --release --bin aptos-node --features testing && \
        cargo build --release --package aptos-faucet-service --features testing && \
        cp target/release/aptos-node /build/aptos-node && \
        cp target/release/aptos-faucet-service /build/aptos-faucet-service; \
    else \
        cargo build --bin aptos-node --features testing && \
        cargo build --package aptos-faucet-service --features testing && \
        cp target/debug/aptos-node /build/aptos-node && \
        cp target/debug/aptos-faucet-service /build/aptos-faucet-service; \
    fi

# Stage 2: Runtime image (minimal)
FROM debian:bullseye-slim

ARG TARGETARCH=amd64

# Install runtime dependencies (matching aptos debian-base + libdw1)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    iproute2 \
    libpq5 \
    libssl1.1 \
    libdw1 \
    netcat \
    net-tools \
    tcpdump \
    && rm -rf /var/lib/apt/lists/*

# Add Tini to make sure the binaries receive proper SIGTERM signals when Docker is shut down
ADD --chmod=755 https://github.com/krallin/tini/releases/download/v0.19.0/tini-${TARGETARCH} /tini

# Create aptos user
RUN groupadd -g 6180 aptos && \
    useradd -u 6180 -g aptos -s /bin/bash -m aptos

# Copy binaries from builder stage
COPY --from=builder /build/aptos-node /usr/local/bin/aptos-node
COPY --from=builder /build/aptos-faucet-service /usr/local/bin/aptos-faucet-service

# Set permissions
RUN chmod +x /usr/local/bin/aptos-node && \
    chmod +x /usr/local/bin/aptos-faucet-service

# Create data directory
RUN mkdir -p /opt/aptos/var && \
    chown -R aptos:aptos /opt/aptos

# Add build metadata
ARG BUILD_DATE
ARG GIT_SHA
ENV BUILD_DATE=${BUILD_DATE}
ENV GIT_SHA=${GIT_SHA}

# Expose ports
EXPOSE 6180 6181 6182 8080 9101

# Set working directory
WORKDIR /opt/aptos

# Run as aptos user
USER aptos

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8080/v1 || exit 1

# Use Tini as entrypoint for proper signal handling
ENTRYPOINT ["/tini", "--", "/usr/local/bin/aptos-node"]
CMD ["--help"]
