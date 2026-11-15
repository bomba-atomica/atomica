#!/usr/bin/env bash
# Fixture: one pull, then exactly one retry.
docker pull "$1" && exit 0
docker pull "$1"
