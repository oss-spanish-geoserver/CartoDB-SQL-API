all:
	npm install

clean:
	rm -rf node_modules/*

check:
	npm test

jshint:
	@echo "***jshint***"
	@./node_modules/.bin/jshint app/ batch/ test/ app.js

TEST_SUITE := $(shell find test/{acceptance,unit} -name "*.js")
TEST_SUITE_UNIT := $(shell find test/unit -name "*.js")
TEST_SUITE_ACCEPTANCE := $(shell find test/acceptance -name "*.js")

test:
	@echo "***tests***"
	test/run_tests.sh ${RUNTESTFLAGS} $(TEST_SUITE)

test-unit:
	@echo "***unit tests***"
	test/run_tests.sh ${RUNTESTFLAGS} $(TEST_SUITE_UNIT)

test-acceptance:
	@echo "***acceptance tests***"
	test/run_tests.sh ${RUNTESTFLAGS} $(TEST_SUITE_ACCEPTANCE)

test-all: jshint test

.PHONY: test
