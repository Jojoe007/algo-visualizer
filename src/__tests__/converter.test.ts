import { describe, expect, it } from 'vitest';
import { execute } from '../sandbox/execute';
import { Player } from '../core/player';
import { defaultInputFor, randomArray, randomGraph, randomGrid, defaultGrid } from '../core/inputs';
import type { Step } from '../core/trace';
import type { Template } from '../core/tracer';
import { TEMPLATES } from '../algorithms/registry';
import { LANGUAGES, toJavaScript } from '../lang/registry';

const example = (name: string) => LANGUAGES.java.examples.find((e) => e.name === name)!;
const preset = (template: Template, name: string) => TEMPLATES[template].presets.find((p) => p.name === name)!.source;

function convert(java: string) {
  const r = toJavaScript('java', java);
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.code;
}

/** Runs a Java method body (with `a` and `viz` in scope) and returns everything it printed. */
function printed(body: string, input: number[] = [3, 1, 2]): string[] {
  const { steps, error } = execute(convert(`class T {\n static void run(int[] a, Viz viz) {\n${body}\n }\n}`), 'array', input);
  expect(error).toBeUndefined();
  return steps.flatMap((s) => (s.kind === 'log' ? [s.text] : []));
}

/** Steps without line/vars, filtered to one family (e.g. 'grid.'), for comparing two traces. */
const visual = (steps: Step[], prefix: string) =>
  steps.filter((s) => s.kind.startsWith(prefix)).map(({ line: _l, vars: _v, ...rest }) => rest);

describe('java examples', () => {
  it.each(LANGUAGES.java.examples.map((e) => [e.name, e]))('%s converts and runs', (_, ex) => {
    const { steps, error } = execute(convert(ex.source), ex.template, defaultInputFor(ex.template));
    expect(error).toBeUndefined();
    expect(steps.length).toBeGreaterThan(1);
  });

  it('keeps every step on a code line of the Java source', () => {
    for (const ex of LANGUAGES.java.examples) {
      const javaLines = ex.source.split('\n');
      const { steps } = execute(convert(ex.source), ex.template, defaultInputFor(ex.template));
      for (const s of steps) {
        if (s.line === undefined) continue;
        const text = javaLines[s.line - 1].trim();
        expect(text, `${ex.name} line ${s.line}`).not.toBe('');
        expect(text.startsWith('*') || text.startsWith('/')).toBe(false);
      }
    }
  });

  it('bubble sort sorts and swaps exactly like the JS preset', () => {
    const java = convert(example('Bubble sort').source);
    for (let t = 0; t < 20; t++) {
      const input = randomArray(1 + Math.floor(Math.random() * 16));
      const ours = execute(java, 'array', input);
      const theirs = execute(preset('array', 'Bubble sort'), 'array', input);
      expect(ours.error).toBeUndefined();
      expect(new Player(ours.steps).stateAt(ours.steps.length - 1).array!.values).toEqual([...input].sort((x, y) => x - y));
      expect(visual(ours.steps, 'array.swap')).toEqual(visual(theirs.steps, 'array.swap'));
    }
  });

  it('BFS paints the same grid as the JS preset', () => {
    const java = convert(example('Breadth-first search').source);
    for (let t = 0; t < 20; t++) {
      const grid = randomGrid(defaultGrid(), 0.3);
      expect(visual(execute(java, 'grid', grid).steps, 'grid.')).toEqual(visual(execute(preset('grid', 'Breadth-first search'), 'grid', grid).steps, 'grid.'));
    }
  });

  it('Dijkstra paints the same graph as the JS preset', () => {
    const java = convert(example('Dijkstra').source);
    for (let t = 0; t < 20; t++) {
      const graph = randomGraph();
      expect(visual(execute(java, 'graph', graph).steps, 'graph.')).toEqual(visual(execute(preset('graph', 'Dijkstra'), 'graph', graph).steps, 'graph.'));
    }
  });
});

describe('java semantics', () => {
  it('integer division and casts truncate toward zero', () => {
    expect(printed('viz.log(7 / 2); viz.log(-7 / 2); viz.log((int) 3.9); viz.log((int) -3.9); viz.log(7.0 / 2);')).toEqual(['3', '-3', '3', '-3', '3.5']);
    expect(printed('int x = 7; x /= 2; viz.log(x); int y = 5; y *= 1.5; viz.log(y);')).toEqual(['3', '7']);
    expect(printed('viz.log(Math.floorMod(-7, 3)); viz.log(-7 % 3);')).toEqual(['2', '-1']);
  });

  it('chars are numbers that print as characters', () => {
    expect(printed(`char c = 'a'; c += 2; viz.log(c - 'a'); System.out.println("got " + c); viz.log(String.valueOf('z'));`)).toEqual(['2', 'got c', 'z']);
    expect(printed(`String s = "hey"; int n = 0; for (char ch : s.toCharArray()) n += ch; viz.log(n == 'h' + 'e' + 'y'); viz.log(s.charAt(1) == 'e');`)).toEqual(['true', 'true']);
  });

  it('arrays are zero-filled and support 2D', () => {
    expect(printed('int[] z = new int[3]; viz.log(Arrays.toString(z)); boolean[] f = new boolean[2]; viz.log(f[1]);')).toEqual(['[0, 0, 0]', 'false']);
    expect(printed('int[][] g = new int[2][3]; g[1][2] = 5; viz.log(g[1][2] + g[0][2]); viz.log(g[0].length); int[] lit = {4, 5}; viz.log(lit.length);')).toEqual(['5', '3', '2']);
  });

  it('maps collections onto JS arrays, Maps and Sets', () => {
    expect(printed(`
      List<Integer> l = new ArrayList<>();
      l.add(1); l.add(3); l.add(1, 2);
      viz.log(l.size() + " " + l.get(1) + " " + l.contains(3) + " " + l.remove(0));
      Map<String, Integer> m = new HashMap<>();
      m.put("x", 1); m.put("x", m.getOrDefault("x", 0) + 1);
      viz.log(m.get("x") + " " + m.getOrDefault("y", 9) + " " + m.containsKey("y") + " " + (m.get("y") == null));
      Set<Integer> s = new HashSet<>(); s.add(4); s.add(4);
      viz.log(s.size() + " " + s.contains(4));`)).toEqual(['3 2 true 1', '2 9 false true', '1 true']);
  });

  it('distinguishes Stack (LIFO) from Deque/Queue push and pop', () => {
    expect(printed(`
      Stack<Integer> st = new Stack<>(); st.push(1); st.push(2);
      Deque<Integer> dq = new ArrayDeque<>(); dq.push(1); dq.push(2);
      Queue<Integer> q = new LinkedList<>(); q.offer(1); q.offer(2);
      viz.log(st.peek() + " " + st.pop() + " " + dq.peek() + " " + dq.pop() + " " + q.peek() + " " + q.poll());`)).toEqual(['2 2 2 2 1 1']);
  });

  it('supports static fields, helpers, recursion, switch and ternaries', () => {
    const java = `class T {
      static int calls = 0;
      static int fib(int n) { calls++; return n < 2 ? n : fib(n - 1) + fib(n - 2); }
      static void run(int[] a, Viz viz) {
        viz.log(fib(10));
        switch (calls % 3) { case 0: viz.log("zero"); break; case 1: viz.log("one"); break; default: viz.log("two"); }
      }
    }`;
    const { steps, error } = execute(convert(java), 'array', [1]);
    expect(error).toBeUndefined();
    expect(steps.filter((s) => s.kind === 'log').map((s) => (s as { text: string }).text)).toEqual(['55', 'zero']) // fib(10) makes 177 calls;
  });

  it('renames identifiers that are reserved in JavaScript', () => {
    expect(printed('int function = 2; int let = 3; viz.log(function * let);')).toEqual(['6']);
  });
});

describe('java diagnostics', () => {
  const diag = (java: string) => toJavaScript('java', java).diagnostics;

  it('reports syntax errors with their line', () => {
    expect(diag('class A {\n static void run(int[] a, Viz viz) {\n  int x = ;\n }\n}')).toMatchObject([{ severity: 'error', line: 3 }]);
  });

  it('reports unsupported constructs instead of throwing', () => {
    expect(diag('class A {\n static void run(int[] a, Viz viz) {\n\n  Runnable r = () -> {};\n }\n}')).toMatchObject([{ severity: 'error', line: 4, message: expect.stringContaining('Lambdas') }]);
    expect(diag('class A {\n static void run(int[] a, Viz viz) {\n  viz.log(nope);\n }\n}')).toMatchObject([{ severity: 'error', line: 3, message: expect.stringContaining("'nope'") }]);
    expect(diag('class A {\n static void f(int x) {}\n static void f(String s) {}\n static void run(int[] a, Viz viz) {}\n}')).toMatchObject([{ severity: 'error', line: 3 }]);
    expect(diag('class A {\n static void helper() {\n  System.out.println(1);\n }\n static void run(int[] a, Viz viz) {}\n}')).toMatchObject([{ severity: 'error', line: 3 }]);
  });

  it('warns when there is no run method', () => {
    expect(diag('class A {\n static int f() { return 1; }\n}')).toMatchObject([{ severity: 'warning', line: 1 }]);
  });

  it('passes JavaScript through unchanged', () => {
    const js = 'function run(a, viz) {}\n';
    expect(toJavaScript('javascript', js)).toMatchObject({ code: js, diagnostics: [] });
  });
});
