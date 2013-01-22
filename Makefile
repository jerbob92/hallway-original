export GIT_REVISION?=$(shell git rev-parse --short --default HEAD)
# if not provided by Jenkins, then just use the gitrev
export BUILD_NUMBER?=git-$(GIT_REVISION)
export SUPPRESS_LOGS=true

.PHONY: deps check_deps build npm_modules migrations ltest test lcov cov \
	bindist test-bindist clean jenkins all view-cov

all: build
	@echo
	@echo "Looks like everything worked!"
	@echo

# install system level dependencies into deps/
deps:
	./scripts/install-deps deps
	@echo
	@echo "Go ahead and run 'make'"

# check if system level dependencies are installed
check_deps:
	@. scripts/use-deps.sh && \
	if ! ./scripts/install-deps --check-only; then \
		echo Some dependencies are missing.  Try running "make deps" to install them.; \
		exit 1; \
	fi

# Get Hallway ready to run
build: check_deps npm_modules

# install node dependencies via npm
npm_modules:
	@. scripts/use-deps.sh && \
		npm install

migrations:
	@echo "Applying migrations"
	./node_modules/db-migrate/bin/db-migrate -v --config Config/config.json -e database up

ltest:
	@env CONFIG_PATH="$(shell pwd)/test/resources/config.json" \
		scripts/test-harness.sh

test: build ltest

lcov:
	@env CONFIG_PATH="$(shell pwd)/test/resources/config.json" \
		scripts/test-coverage.sh

cov: build lcov

covershot/index.html: lcov

view-cov: covershot/index.html
	@cd covershot && python -mSimpleHTTPServer

SUBDIR=hallway-$(BUILD_NUMBER)
DISTFILE=$(SUBDIR).tar.gz

# create a ready-to-run tarball with a complete build inside
bindist: $(DISTFILE)

$(DISTFILE):
	./scripts/build-tarball "$(SUBDIR)" "$@"

# create a ready-to-run tarball, and then run tests on the contents
test-bindist: $(DISTFILE)
	./scripts/test-tarball "$(SUBDIR)" "$<"

# this is the rule that Jenkins runs as of 2012-04-18
jenkins:
	$(MAKE) test-bindist

clean:
	rm -f "$(DISTFILE)"
	rm -f "hallway-git-*.tar.gz"
	rm -rf covershot
	rm -rf lib-cov
	rm -rf node_modules
