---
'nexus-agents': minor
---

Absorb standards repo into expert system with 44 skills, 24 knowledge modules, and product-type routing

- Add 24 knowledge modules enriching SecurityExpert, TestingExpert, CodeExpert, ArchitectureExpert, and DocumentationExpert
- Register 17 built-in standards skills in SkillLibrary at startup (security, testing, coding, architecture)
- Add 5 optional lazy-loaded skill packs (compliance, ml-ai, mobile, cloud, misc) with 27 additional skills
- Integrate product type detection into SharedTaskAnalyzer for 8 product types (api, web-service, cli, frontend-web, mobile, data-pipeline, ml-service, infra-module)
- Add product matrix configuration with expert weight routing per product type
- Extract task analysis keywords and product type detector into separate modules
