COMPACT   = compact
SRC       = event-tickets.compact
OUT_DIR   = ../generated
ARTIFACT  = $(OUT_DIR)/managed/event-tickets/contract
FRONTEND  = ../frontend/public/contracts/event-tickets

.PHONY: build check clean copy-to-frontend

## build: full compile with ZK key generation (~5-10 min)
build:
	$(COMPACT) compile +0.30.0 $(SRC) $(OUT_DIR)

## check: syntax-only, no ZK key generation (fast, use during development)
check:
	$(COMPACT) compile +0.30.0 --skip-zk $(SRC) $(OUT_DIR)

## clean: remove generated artefacts
clean:
	rm -rf $(OUT_DIR)

## copy-to-frontend: copy compiled artefacts into Next.js /public so the
##   FetchZkConfigProvider can serve them to the browser.
copy-to-frontend: build
	mkdir -p $(FRONTEND)
	cp -r $(ARTIFACT)/* $(FRONTEND)/
	@echo "Artefacts copied to $(FRONTEND)"
