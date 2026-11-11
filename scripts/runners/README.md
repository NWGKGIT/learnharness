# Local exercise runtimes

The runner uses Docker image IDs from `LH_DATA_DIR/runners.json` (or `data/runners.json` in development), not mutable tags at execution time. Installing images is a separate setup step; a missing runtime produces an unavailable result and never falls back to host execution.

```sh
docker pull eclipse-temurin:21-jdk-jammy
docker pull python:3.14-slim
docker pull node:26-bookworm-slim
docker build -t learnharness-go:1.27 -f scripts/runners/go.Dockerfile scripts/runners
docker build -t learnharness-typescript:5.6.3 -f scripts/runners/typescript.Dockerfile scripts/runners
node scripts/setup-runners.mjs
```

Go's standard-library cache is prepared during image construction so each exercise can compile within the 30-second limit. Compilation and execution use separate restricted containers sharing only the unique exercise directory. The runtime deadline is 10 seconds, output is bounded to 1 MiB, networking is disabled, and the runner cleans up its named containers and temporary files. An in-container deadline also survives interruption of the application server.

Run the real Docker smoke tests after setup:

```sh
LH_RUN_DOCKER_TESTS=1 NODE_ENV=test node --import tsx --test tests/exercise-runner.test.ts
```

A successful process exit is not a mastery grade. Running and submitting an answer are separate actions. Automated exercise test-suite generation and reference-solution verification are not implemented yet.
