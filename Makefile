.PHONY: setup dev build test test-all lint fmt clean

setup:
	bun install

# Build once; open dist/index.html in a browser
dev: build

build:
	bun run build

test:
	bun run test

test-all: test

lint:
	@echo "no linter configured"

fmt:
	@echo "no formatter configured"

clean:
	rm -rf dist node_modules
