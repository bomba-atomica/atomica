#!/usr/bin/env bash
# Fixture: one pull, then two retries (one too many).
docker pull "$1" && exit 0
docker pull "$1" && exit 0
docker pull "$1"
