# Security, Privacy & Compliance Guidelines

## 1. Zero Real PHI in Development
* **Strict Rule:** Never use real patient names, real contact numbers, real national IDs, or actual medical reports in development or test environments.
* Use synthetic data generators (e.g. faker or pre-seeded mock records) for all manual and automated testing.

## 2. Principle of Least Privilege
* Small lab users can only read and write orders belonging to their lab ID.
* Phlebotomists can only read assigned tasks and write pickup/delivery events.
* Large partner labs can only view accessioned samples directed to their testing center.
* Firestore Security Rules must enforce these constraints at the database tier.

## 3. Secret Management
* Never commit `.env` files, `.keystore` files, or `serviceAccountKey.json` to source control.
* All `.env*` files with real keys are ignored in `.gitignore`.
* Production deployments must inject secrets via Google Cloud Secret Manager or environment variables.

## 4. Cold-Chain & Chain-of-Custody Integrity
* Every transition must record:
  * Operator ID (`userId`)
  * Accurate timestamp (`timestamp`)
  * Geolocation coordinates (`latitude`, `longitude`)
  * Temperature reading (`temperatureCelsius`)
  * Verification method (`BARCODE_SCAN` or `DIGITAL_SIGNATURE`)

