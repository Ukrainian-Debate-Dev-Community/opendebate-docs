.PHONY: setup dev build test test-all lint fmt clean

setup:
	bun install

dev:
	bun run dev

build:
	bun run build

test:
	bun run build

test-all:
	bun run build

lint:
	@echo "No linter configured"

fmt:
	@echo "No formatter configured"

clean:
	rm -rf node_modules/ docs/.vitepress/cache/ docs/.vitepress/dist/
