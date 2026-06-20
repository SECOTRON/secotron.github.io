# SECOTRON website — common tasks. Run `make` or `make help` for the list.

# ---- Config -------------------------------------------------------------
BUNDLE      := bundle
JEKYLL      := $(BUNDLE) exec jekyll
PORT        ?= 4000
SITE_DIR    := _site
PROD_ENV    := JEKYLL_ENV=production

.DEFAULT_GOAL := help

# ---- Help (self-documenting) -------------------------------------------
.PHONY: help
help: ## Show this help
	@echo "SECOTRON website — make targets:"
	@echo ""
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "} {printf "  \033[1;33m%-12s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  Override port:  make serve PORT=5000"

# ---- Setup --------------------------------------------------------------
.PHONY: install
install: ## Install Ruby gem dependencies
	$(BUNDLE) install

.PHONY: update
update: ## Update gems to latest allowed versions
	$(BUNDLE) update

# Merge _config.local.yml (git-ignored, holds the local Turnstile site key) when present.
define JCONFIG
cfg="_config.yml"; [ -f _config.local.yml ] && cfg="_config.yml,_config.local.yml"
endef

# ---- Develop ------------------------------------------------------------
.PHONY: config-local
config-local: ## Write _config.local.yml from $TURNSTILE_SITEKEY (direnv)
	@if [ -n "$$TURNSTILE_SITEKEY" ]; then \
	  printf 'turnstile_sitekey: "%s"\n' "$$TURNSTILE_SITEKEY" > _config.local.yml; \
	  echo "wrote _config.local.yml"; \
	else echo "TURNSTILE_SITEKEY not set (direnv allow?). Form CAPTCHA will be blank locally."; fi

.PHONY: serve
serve: config-local ## Serve locally with live reload (http://localhost:4000)
	@$(JCONFIG); $(JEKYLL) serve --livereload --port $(PORT) --config $$cfg

.PHONY: run
run: serve ## Alias for `serve`

.PHONY: drafts
drafts: config-local ## Serve including draft posts
	@$(JCONFIG); $(JEKYLL) serve --livereload --drafts --port $(PORT) --config $$cfg

# ---- Build --------------------------------------------------------------
.PHONY: build
build: config-local ## Production build into _site/
	@$(JCONFIG); $(PROD_ENV) $(JEKYLL) build --config $$cfg

.PHONY: preview
preview: build ## Build, then serve the built site over plain HTTP
	@cd $(SITE_DIR) && python3 -m http.server $(PORT)

# ---- Quality ------------------------------------------------------------
.PHONY: doctor
doctor: ## Run Jekyll's built-in config/health checks
	$(JEKYLL) doctor

.PHONY: check
check: build doctor ## Build and run health checks (CI-style gate)

# ---- Housekeeping -------------------------------------------------------
.PHONY: clean
clean: ## Remove generated site and caches
	$(JEKYLL) clean
	rm -rf $(SITE_DIR) .jekyll-cache .sass-cache
