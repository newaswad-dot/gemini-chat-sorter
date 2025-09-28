# Suggested Maintenance Tasks

## Typographical Error Fix
- **Issue**: The README link to the nvm installation guide splits the word "updating" across two lines, leaving the rendered text as "updatin".
- **Proposed Task**: Join the word and ensure the Markdown link remains intact, keeping the URL within a single line.
- **Reference**: `README.md`, line 21.

## Functional Bug Fix
- **Issue**: The `useToast` hook re-subscribes to the listener on every state change because its `useEffect` dependency array includes `state`, causing multiple duplicated listeners and memory leaks.
- **Proposed Task**: Change the dependency array to `[]` (and ensure the cleanup runs once) or otherwise prevent repeated registrations.
- **Reference**: `src/hooks/use-toast.ts`, lines 167-183.

## Documentation/Text Correction
- **Issue**: The UI copy and meta tags advertise integration with "Gemini 2.5" while the code calls the `gemini-2.0-flash-exp` model, creating a mismatch between documentation and behavior.
- **Proposed Task**: Update the displayed text (or the API call) so both reference the same Gemini model version.
- **Reference**: `src/components/MessageOrganizer.tsx`, line 288; `index.html`, lines 7-19; API call at `src/components/MessageOrganizer.tsx`, line 59.

## Test Improvement
- **Issue**: The `countWhatsAppMessages` helper lacks automated tests, so edge cases such as varying blank line separators or extra whitespace could regress unnoticed.
- **Proposed Task**: Add unit tests that cover single messages, multiple messages separated by varied whitespace, and empty input to lock down the current behavior.
- **Reference**: `src/components/MessageOrganizer.tsx`, lines 32-43.
