#!/usr/bin/env python3
"""First-pass converter: one Alpine prototype page (Build/web/...html) -> a Vue single-file component.
Usage: alpine2vue.py <page.html> <out.vue> [AlpineDataName]
It does the mechanical part (template directives, data/methods split, imports). Anything it can't
convert safely is listed as TODO lines at the end of the output, for a person to finish by hand."""
import re, sys

src = open(sys.argv[1]).read()
out = sys.argv[2]
todo = []

def between(s, a, b, start=0):
    i = s.find(a, start)
    if i < 0: return None
    j = s.find(b, i + len(a))
    return s[i + len(a):j]

# ---------- template ----------
style = between(src, '<style>', '</style>') or ''
m = re.search(r'<main class="content"[^>]*>.*</main>', src, re.S)
tpl = m.group(0) if m else ''
tpl = re.sub(r'\s+x-data="[^"]*"', '', tpl, count=1)
tpl = tpl.replace(' x-cloak', '')
# leaf element with x-text -> {{ }}
def leaf(mm):
    tag, a, expr, b = mm.group(1), mm.group(2), mm.group(3), mm.group(4)
    return f'<{tag}{a}{b}>{{{{ {expr} }}}}</{tag}>'
for _ in range(2):
    tpl = re.sub(r'<(\w+)((?:[^<>"]|"[^"]*")*?) x-text="([^"]*)"((?:[^<>"]|"[^"]*")*)></\1>', leaf, tpl)
for a, b in [('x-text=', 'v-text='), ('x-html=', 'v-html='), ('x-show=', 'v-show='), ('x-model', 'v-model'), ('x-for=', 'v-for='),
             ('x-if=', 'v-if='), ('x-bind:', 'v-bind:'), ('x-on:', 'v-on:'), ('x-ref=', 'ref=')]:
    tpl = tpl.replace(a, b)
tpl = re.sub(r'\s+x-transition(?:[.:][\w.:-]*)?(?:="[^"]*")?', '', tpl)
tpl = re.sub(r'@keydown\.(?:escape|esc)\.window(?:\.\w+)*="([^"]*)"', lambda m: f'v-esc="() => {{ {m.group(1)} }}"', tpl)
tpl = re.sub(r'@click\.outside(?:\.\w+)*="([^"]*)"', lambda m: f'v-click-outside="() => {{ {m.group(1)} }}"', tpl)
for bad in re.findall(r'\b(x-[a-z]+(?:[.:][\w.-]+)?)=', tpl): todo.append(f'template still has {bad}')
for bad in re.findall(r'@[\w-]+(?:\.[\w-]+)*\.(?:window|document|outside)\b', tpl): todo.append(f'template has {bad} (Vue has no .window/.document/.outside; add a listener in mounted and remove it in unmounted)')
for bad in set(re.findall(r'\$(store|dispatch|el|root|data|id)\b', tpl)): todo.append(f'template uses ${bad}')
if re.search(r'<script(?![^>]*type="module")', tpl): todo.append('template has an inline <script>')

# ---------- script ----------
scripts = re.findall(r'<script type="module">(.*?)</script>', src, re.S)
js = scripts[-1] if scripts else ''
name = sys.argv[3] if len(sys.argv) > 3 else (re.search(r"Alpine\.data\('(\w+)'", js) or [None, None])[1]

imports, rest = [], []
for line in js.split('\n'):
    (imports if re.match(r'\s*import\s', line) or (imports and imports[-1].rstrip().endswith(',') ) or (imports and not re.search(r"from\s+'", imports[-1]) and re.match(r'\s*import', imports[-1])) else rest).append(line)
imp = '\n'.join(imports)
imp = re.sub(r"\s*import Alpine from '[^']+';\n?", '\n', imp)
imp = re.sub(r"'https://www\.gstatic\.com/firebasejs/[\d.]+/firebase-(\w+)\.js'", r"'firebase/\1'", imp)
imp = re.sub(r"'/js/firebase-config\.js'", "'@/firebase-config.js'", imp)
if re.search(r"\b(readTheme|saveTheme|applyTheme)\b", imp): todo.append('theme functions now live in @/lib/theme.js (toast stays in @/lib/toast.js)')
if re.search(r"\bNAV\b", imp): todo.append('NAV now lives in @/nav.js (paths without .html, key "to" instead of "href")')
imp = re.sub(r"'/js/(shell)\.js'", "'@/lib/toast.js'", imp)
imp = re.sub(r"'/js/([\w-]+\.js)'", r"'@/lib/\1'", imp)
imp = re.sub(r"'/(HR|Finance|Operations|Portfolio|Settings|Playbook|Procurement|Reports|Dashboard)/([\w-]+)\.js'", r"'./\2.js'", imp)
imp = re.sub(r'\brequireRole,\s*|,\s*requireRole\b|\brenderShell,\s*|,\s*renderShell\b', '', imp)
imp = re.sub(r"import \{\s*(requireRole|renderShell)\s*\} from '[^']+';\n?", '', imp)
imp = re.sub(r"import \{\s*\} from '[^']+';\n?", '', imp)
imp += "\nimport { useSession } from '@/stores/session.js';"

body = '\n'.join(rest)
body = re.sub(r'\n\s*const me = await requireRole\([^)]*\);', '\n  const me = useSession();', body)
body = re.sub(r'\n\s*renderShell\([^\n]*\);', '', body)
body = re.sub(r'\n\s*Alpine\.start\(\);', '', body)
uses_params = bool(re.search(r'const params = new URLSearchParams\(location\.search\);', body))
body = body.replace('const params = new URLSearchParams(location.search);', 'let params = new URLSearchParams(location.search);')

comp = None
mm = re.search(r"Alpine\.data\('" + re.escape(name or '') + r"', \(\) => \(\{", body) if name else None
if mm:
    i = mm.end(); depth = 1; j = i; q = None
    while j < len(body) and depth:
        c = body[j]
        if q:
            if c == '\\': j += 2; continue
            if c == q: q = None
        elif c in '\'"`': q = c
        elif c == '/' and body[j+1:j+2] == '/': j = body.index('\n', j); continue
        elif c in '{([': depth += 1
        elif c in '})]': depth -= 1
        j += 1
    comp = body[i:j-1]
    before, after = body[:mm.start()], body[j:]
    after = re.sub(r'^\)\);?', '', after.lstrip())
    # split top-level entries
    entries, depth, q, start, k = [], 0, None, 0, 0
    while k < len(comp):
        c = comp[k]
        if q:
            if c == '\\': k += 2; continue
            if c == q: q = None
        elif c in '\'"`': q = c
        elif c == '/' and comp[k+1:k+2] == '/': k = comp.index('\n', k); continue
        elif c in '{([': depth += 1
        elif c in '})]': depth -= 1
        elif c == ',' and depth == 0: entries.append(comp[start:k]); start = k + 1
        k += 1
    entries.append(comp[start:])
    data, methods, computed, hooks = [], [], [], {}
    for e in entries:
        s = e.strip()
        if not s: continue
        core = re.sub(r'^(\s*//[^\n]*\n)+', '', s).strip()
        mh = re.match(r'(async\s+)?(\w+)\s*\(', core)
        mg = re.match(r'get\s+(\w+)\s*\(', core)
        if mg: computed.append(e.rstrip()); continue
        if mh and core.endswith('}'):
            if mh.group(2) == 'init': hooks['mounted'] = e.rstrip().replace('init(', 'mounted(', 1); continue
            if mh.group(2) == 'destroy': hooks['unmounted'] = e.rstrip().replace('destroy(', 'unmounted(', 1); continue
            methods.append(e.rstrip()); continue
        data.append(e.rstrip())
    def block(xs, shift):
        txt = ','.join(xs).strip('\n')
        lines = txt.split('\n')
        base = min((len(l) - len(l.lstrip()) for l in lines if l.strip()), default=0)
        return '\n'.join((' ' * shift + l[base:]) if l.strip() else '' for l in lines)
    comp_js = 'export default {\n'
    if uses_params: comp_js += '  beforeCreate() { params = new URLSearchParams(location.search); },\n'
    comp_js += '  data() {\n    return {\n' + block(data, 6) + '\n    };\n  },\n'
    if computed: comp_js += '  computed: {\n' + block([re.sub(r'^(\s*)get\s+', r'\1', c) for c in computed], 4) + '\n  },\n'
    for h in ('mounted', 'unmounted'):
        if h in hooks: comp_js += block([hooks[h]], 2) + ',\n'
    comp_js += '  methods: {\n' + block(methods, 4) + '\n  }\n};'
    body = before.rstrip() + '\n\n' + after.strip() + ('\n\n' if after.strip() else '\n') + comp_js
else:
    todo.append('no Alpine.data component found: script needs converting by hand')

for bad in set(re.findall(r'\$(store|dispatch|el|root|data|id)\b', body)): todo.append(f'script uses ${bad}')
if re.search(r'(window|document)\.addEventListener', body): todo.append('script adds window/document listeners: remove them in unmounted (pages no longer reload)')
if re.search(r'location\.(href|replace|assign)\s*[=(]|location\.href', body): todo.append('script navigates with location: use this.$router.push / RouterLink and the new paths (no .html)')
if re.search(r'history\.(push|replace)State', body): todo.append('script uses history.pushState/replaceState: check it still matches the router')
if 'getElementById' in body or 'querySelector' in body: todo.append('script reads the DOM directly: prefer refs')
if re.search(r'\.html\b', tpl + body): todo.append('old .html links remain: change to the new paths')
if 'await ' in re.sub(r'export default \{.*', '', body, flags=re.S).replace('const me = useSession();', ''):
    todo.append('top-level await outside the component: move it into mounted()')

def dedent(t):
    ls = t.split('\n'); b = min((len(l) - len(l.lstrip()) for l in ls if l.strip() and not l.startswith('export default') and not l.startswith('  ') is False), default=0)
    return t
def dedent_mod(t):
    head, sep, tail = t.partition('export default {')
    ls = head.split('\n'); b = min((len(l) - len(l.lstrip()) for l in ls if l.strip()), default=0)
    head = '\n'.join(l[b:] for l in ls)
    head = re.sub(r'\n{3,}', '\n\n', head)
    return head + sep + tail
body = dedent_mod(body)
imp = '\n'.join(l.strip() if l.strip().startswith('import') else '  ' + l.strip() for l in imp.split('\n') if l.strip())
tl = tpl.split('\n'); tb = min((len(l) - len(l.lstrip()) for l in tl[1:-1] if l.strip()), default=4)
tpl = '\n'.join([tl[0]] + ['    ' + l[tb:] if l.strip() else '' for l in tl[1:-1]] + ['  ' + tl[-1].strip()])
res = '<template>\n  ' + tpl.strip() + '\n</template>\n\n<script>\n' + imp.strip() + '\n' + body.rstrip() + '\n</script>\n'
if style.strip(): res += '\n<style scoped>' + style.rstrip() + '\n</style>\n'
open(out, 'w').write(res)
print(out, 'TODO:' if todo else 'clean')
for t in dict.fromkeys(todo): print('  -', t)
