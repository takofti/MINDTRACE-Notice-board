# License proposal

No license file has been added to this repository. The owner asked for a proposal before applying one.

## Recommended: MIT

Best if Mindtrace is meant to be open source and easy for others to use, modify and redistribute.

- Very short and familiar.
- Permits commercial use and closed-source forks.
- Requires preserving the copyright notice.
- No patent grant and no warranty.

## Alternative: Apache-2.0

Choose this if patents, contributor patent grants or a more explicit trademark/notice structure matter.

- Permissive like MIT, with an express patent grant.
- Requires keeping NOTICE/change notices in some distributions.
- Slightly more process for contributors and users.

## Alternative: PolyForm Noncommercial 1.0.0

Choose this if the source should be public for learning and personal use, but commercial use should require a separate license.

- Not OSI-approved “open source”; some package registries and Linux distributions will refuse it.
- Potential friction with GitHub/community expectations.
- Requires clear commercial licensing terms.

## Alternative: Proprietary / all rights reserved

Choose this if Mindtrace will be sold or kept closed.

- A separate EULA is needed for installers.
- Third-party dependency notices must still be included.
- The current default (no license) is effectively all rights reserved, but it is not a good long-term distribution posture because users have no explicit right to use the binaries or source.

## Dependency notes

The project uses MIT/ISC/BSD/Apache-2.0-licensed packages, including Electron, React, Zustand, lucide-react, JSZip, jsPDF, Mammoth, Vite and electron-builder. Any chosen project license should be accompanied by a generated third-party notices file before a public release. That notices file is not generated yet.

## Suggested decision

For a public GitHub project that should be easy to adopt: **MIT**.
For a public project with patent-sensitive corporate users: **Apache-2.0**.
For a planned commercial product: keep the source private and add a proprietary EULA plus code signing.

Once a decision is made, add the exact license text as `LICENSE` and update the “License” section of `README.md`.
