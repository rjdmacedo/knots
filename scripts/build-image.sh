#!/bin/bash

KNOT_APP_NAME=$(node -p -e "require('./package.json').name")
PACKAGE_VERSION=$(node -p -e "require('./package.json').version")

# Try to get version from git tag (e.g., v1.19.4 -> 1.19.4)
# Fall back to package.json version if git tag is not available
if git describe --tags --exact-match HEAD 2>/dev/null | grep -qE '^v?[0-9]+\.[0-9]+\.[0-9]+'; then
  GIT_TAG=$(git describe --tags --exact-match HEAD 2>/dev/null)
  # Remove 'v' prefix if present
  KNOT_VERSION=$(echo "$GIT_TAG" | sed 's/^v//')
else
  KNOT_VERSION=$PACKAGE_VERSION
fi

# we need to set dummy data for POSTGRES env vars in order for build not to fail
docker buildx build \
    --build-arg APP_VERSION=${KNOT_VERSION} \
    -t ${KNOT_APP_NAME}:${KNOT_VERSION} \
    -t ${KNOT_APP_NAME}:latest \
    .

docker image prune -f
