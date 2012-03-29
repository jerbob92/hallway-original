export GIT_REVISION?=$(shell git rev-parse --short --default HEAD)
# if not provided by Jenkins, then just use the gitrev
export BUILD_NUMBER?=git-$(GIT_REVISION)

all: build
	@echo
	@echo "Looks like everything worked!"
	@echo "Get some API keys (https://github.com/LockerProject/Locker/wiki/GettingAPIKeys) and then try running:"
	@echo "./locker"
	@echo
	@echo "Once running, visit http://localhost:8042 in your web browser."

# install system level dependencies into deps/
deps:
	./scripts/install-deps deps
	@echo
	@echo "Go ahead and run 'make'"
.PHONY: deps

# check if system level dependencies are installed
check_deps:
	@. scripts/use-deps.sh && \
	if ! ./scripts/install-deps --check-only; then \
		echo Some dependencies are missing.  Try running "make deps" to install them.; \
		exit 1; \
	fi

# get Locker ready to run
build: check_deps npm_modules build.json common
.PHONY: build

common:
	@. scripts/use-deps.sh && \
	make -C Apps/dashboardv3/static/common

# install node dependencies via npm
npm_modules:
	@. scripts/use-deps.sh && \
	npm install
.PHONY: npm_modules

# build.json allows Locker to report its build number and git revision at runtime
# the test suite pretends that tests/ is the top of the source tree,
# so drop a copy there too
build.json:
	echo '{ "build" : "$(BUILD_NUMBER)", "gitrev" : "$(GIT_REVISION)" }' \
	| tee $@ tests/$@
.PHONY: build.json

# run all of the tests
test: newtest

# new style mocha tests
MOCHA = ./node_modules/.bin/mocha
MOCHA_TESTS = $(shell find test -name "*.test.js")
newtest: build
	@env NODE_PATH="lib:$(PWD)/Common/node" \
	$(MOCHA) $(MOCHA_TESTS)

# old style vows tests
oldtest: build
	cd tests && \
	env NODE_PATH="$(PWD)/lib:$(PWD)/Common/node" \
	node ./runTests.js

# phantom tests
PHANTOM_TESTS = $(shell find test -name "*.phantom.js")
phantomtest: build
	@env NODE_PATH="$(PWD)/Common/node" \
	$(MOCHA) $(PHANTOM_TESTS)

SUBDIR=carebear-$(BUILD_NUMBER)
DISTFILE=$(SUBDIR).tar.gz

# create a ready-to-run tarball with a complete build inside
bindist: $(DISTFILE)

$(DISTFILE): 
	./scripts/build-tarball "$(SUBDIR)" "$@"

# create a ready-to-run tarball, and then run tests on the contents
test-bindist: $(DISTFILE)
	./scripts/test-tarball "$(SUBDIR)" "$<"

# this is the rule that Jenkins runs as of 2012-03-16
jenkins:
	xvfb-run -a --server-args="-screen 0 1280x960x24" $(MAKE) test-bindist

clean:
	rm -f "$(DISTFILE)" "$(TEMPLATE_OUTPUT)" build.json tests/build.json
	rm -f "carebear-git-*.tar.gz"
	rm -rf node_modules
