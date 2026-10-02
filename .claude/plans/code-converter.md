# Code Converter (Java → JavaScript PoC)

## Context
The Playground only runs JavaScript. The goal is to let people write algorithms in other languages. Those languages won't run natively. A **converter** translates them into the JavaScript the sandbox already runs. This PoC adds a **Code Converter** tab to the top bar with one direction only: Java → JS.

Two future features should reuse this work instead of being bolted on later:
1. **Multi-language Playground.** The Playground converts Java (and later other languages) before `runUserCode`, and highlights the *original* source line while playing.
2. **CPU / VM machine simulation.** The same parsed program compiles to a bytecode for a simulated machine (stack, frames, registers, memory).

So the converter is built as a small compiler: **front end per language → language-neutral Core IR → back ends**. The JS emitter is the only back end now. A bytecode compiler for the VM becomes a second back end later.

> First implementation step: copy this plan to `.claude/plans/code-converter.md` (CLAUDE.md convention).

## Architecture

```
Java source
  → lang/java/lexer.ts      tokens with line/col
  → lang/java/parser.ts     recursive descent → Java AST (subset)
  → lang/java/lower.ts      Java AST → Core IR (resolves types: int vs double, arrays, ArrayList, Map)
  → ir/ (Core IR)           language-neutral, typed, every node has `loc`
  → backends/js/emit.ts     Core IR → JS text, line-aligned to the source
  (future) backends/vm/compile.ts  Core IR → bytecode for machine simulation
```

New modules, keeping CLAUDE.md's "single-purpose modules" rule:

- `src/lang/types.ts`
  - `LanguageId = 'javascript' | 'java'`
  - `Diagnostic { severity, message, line, column }`
  - `ConvertResult { code: string; lineMap: number[] /* jsLine → srcLine */; diagnostics: Diagnostic[] }`
  - `Frontend { id, label, monacoLanguage, parse(src) → { ir, diagnostics } }`
- `src/lang/registry.ts`
  - `LANGUAGES: Record<LanguageId, …>`: the label, Monaco language id, frontend (none for `javascript`, which passes through) and Java examples per `Template`.
  - `toJavaScript(lang, src): ConvertResult`. This is the **single entry point** the Playground will call later. For `javascript` it is the identity with an identity line map.
- `src/ir/core.ts`: Core IR types, kept small and VM-friendly.
  - `Program { functions: Fn[] }`
  - `Fn { name, params: {name, type}[], returnType, body }`
  - Types: `int | double | boolean | char | string | array<T> | list<T> | map<K,V> | void | any`
  - Statements: `VarDecl, Assign, If, While, For, Return, Break, Continue, ExprStmt, Block`
  - Expressions: `Literal, Var, Binary (op + operand type), Unary, Call, Index, Field, NewArray, NewList, NewMap, MethodCall` (for `viz`/host calls)
  - Explicit semantic ops, so back ends don't need to re-infer types. For example `Binary{op:'/', kind:'int'}` means truncating division, and `Cast{to:'int'}`.
  - Every node carries `loc: { line, column }`. The JS emitter and the future VM both map back to source lines through it.
- `src/lang/java/{lexer,parser,ast,lower,index}.ts`: the Java front end. The supported subset is listed below. Anything else becomes a `Diagnostic` with a line, not a crash.
- `src/backends/js/emit.ts`: walks the IR and emits JS.
  - **Line-aligned emission:** before writing a statement whose `loc.line` is L, pad with newlines until the output line is L. JS line numbers then equal Java line numbers in the common case. `__line(n)`, step highlighting and runtime error lines then point at the Java source with no remapping. `lineMap` covers the cases where alignment can't hold.
  - Each low-level translation gets a small named helper, as CLAUDE.md asks: `intDiv`, `newArrayOf`, `listMethod`, `mapMethod`.

### Java subset (PoC)
- One top-level class. Its `static` methods become top-level `function`s.
- `static void run(int[] a, Viz viz)` is the entry point. Its parameter types depend on the template: `int[]` for array, `Grid` for grid, `Graph` for graph, `Object`/`TreeInput` for tree. Other static methods become helpers.
- Primitive types `int long double boolean char String`, `var`, and arrays (`new int[n]`, array literal `{…}`, `.length`)
- `ArrayList`/`List`: `add get set size remove isEmpty`. `HashMap`/`Map`: `put get getOrDefault containsKey`. `ArrayDeque`/`Queue`: `offer poll peek isEmpty`.
- Control flow: `if/else`, `for`, enhanced `for`, `while`, `do-while`, `break`, `continue`, `return`, ternary, `++/--`, compound assignment
- `Math.*` maps to `Math.*`. `Integer.MAX_VALUE` / `MIN_VALUE`. `System.out.println`/`print` map to `viz.log`.
- `viz.*` and template-object calls (`grid.neighbors`, `graph.outgoing`) pass through unchanged. They are typed as `any` host calls.
- Semantics handled explicitly:
  - integer division and casts truncate (`Math.trunc`)
  - `char` is a number, and char literals become char codes
  - `new int[n]` is zero-filled
  - string `+` concatenation
- Out of scope: generics beyond type-arg erasure, inner and anonymous classes, lambdas, exceptions, instance classes and `new MyNode()`, overflow wrapping of `int`. Overflow is documented as a known divergence.

## UI
- `src/App.tsx`: add `<NavLink to="/convert">Code Converter</NavLink>` and `<Route path="/convert" element={<CodeConverter/>}/>`.
- `src/pages/CodeConverter.tsx`
  - Split view: the Java editor (left) and the read-only JS output (right). Both use `CodePanel`.
  - Toolbar:
    - **Template** select. It picks the Java example and the target template.
    - **Example** select, from `LANGUAGES.java.examples[template]`.
    - **Open in Playground** button. It navigates to `/playground` with the existing `Seed` state `{ template, code: js, name }`. `Playground.initialSeed` already accepts `location.state`, so the Playground needs no changes.
  - Conversion runs live, debounced around 250 ms. The front end is pure and synchronous, so it needs no worker.
  - Diagnostics show as Monaco markers on the Java side, with a short list under the toolbar.
  - Each Java editor line is linked to its matching JS output line by a hover/line highlight that uses `lineMap`.
- `src/components/CodePanel.tsx`
  - Add an optional `language` prop (default `'javascript'`).
  - Generalize `error?: RunError` to also accept `markers?: Diagnostic[]`. The existing `syncError` builds the markers from it, so that logic is reused rather than duplicated.
- `src/monacoSetup.ts`: confirm that Java syntax highlighting is in the bundled `monaco-editor` main entry. If it isn't, import `monaco-editor/esm/vs/basic-languages/java/java.contribution`.
- Java examples: `src/lang/java/examples/*.java` imported with `?raw`, the same way the JS presets are. Write Bubble sort (array), BFS (grid) and Dijkstra (graph), mirroring the existing presets so the output can be checked against them.
- Styles: reuse the `.pane-header`, `.toolbar` and `.field` classes. Add one `.converter` two-column grid to `index.css` that stacks at narrow widths.

## Future hooks (designed for now, not built)
- **Multi-language Playground:**
  - `SavedAlgo` gains an optional `language` field (default `'javascript'`).
  - The Playground adds a Language select. `useRunner` calls `toJavaScript(language, code)` before `runUserCode`.
  - Step lines already match the source lines because emission is line-aligned. Error lines go through `lineMap`.
- **VM simulation:** `backends/vm/compile.ts` takes the same `ir.Program` and emits bytecode. A new `Template`/renderer shows the stack, frames and memory, with the trace still produced via `Tracer`. The explicit `kind`/type on IR ops is what makes bytecode selection (`IDIV` vs `DDIV`) straightforward.
- **More languages:** each one is just a new `lang/<id>/` front end that lowers to Core IR, plus a registry entry.

## Tests (`src/__tests__/converter.test.ts`)
- Each Java example: `toJavaScript('java', src)` has no diagnostics, and `execute(js, template, input)` runs without error. Sorting output is checked as sorted.
- Equivalence: the trace from the Java bubble sort has the same step kinds and count as the JS `bubbleSort` preset on the same input.
- Line alignment: for each example, every `step.line` points at a non-blank Java source line.
- Semantics:
  - `7/2 == 3`, `-7/2 == -3` and `(int)3.9 == 3`
  - `char` arithmetic
  - `new int[3]` is `[0,0,0]`
  - `ArrayList` and `HashMap` operations
- Diagnostics: an unsupported construct (a lambda, for example) returns a diagnostic with the correct line and no exception.

## Verification
1. `npm test`, `npx tsc -b`, `npm run lint`.
2. `preview_start` the dev server, then open `#/convert`:
   - Load each example and confirm the JS output and that the console has no errors.
   - Introduce a syntax error and check that a marker appears on the right line.
   - Click **Open in Playground**. It should run and animate with the highlighted lines matching.
   - Check dark mode and a narrow width.
   - Screenshot.
3. Commit as `added java to javascript code converter`, lowercase with no attribution lines, per CLAUDE.md.
