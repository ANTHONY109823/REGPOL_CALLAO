# -*- coding: utf-8 -*-
"""
mmpi2_score.py — Calcula puntajes MMPI-2 usando el Excel oficial
Uso: cat data.json | py -3 mmpi2_score.py
Entrada stdin: {"sexo": "Hombre"|"Mujer", "respuestas": {"1":"V","2":"F",...}}
Salida stdout: {"ok": true, "escalas": [...], "sin_contestar": N}
"""
import sys, json, os
# Forzar UTF-8 en Windows
if sys.platform == 'win32':
    import io
    sys.stdin  = io.TextIOWrapper(sys.stdin.buffer,  encoding='utf-8')
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

EXCEL_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'Downloads', 'MMPI-2.xls')
if not os.path.exists(EXCEL_PATH):
    # Buscar el archivo en ubicaciones alternativas
    candidatos = [
        r'C:\Users\USER\Downloads\MMPI-2.xls',
        os.path.join(os.path.expanduser('~'), 'Downloads', 'MMPI-2.xls'),
    ]
    for c in candidatos:
        if os.path.exists(c):
            EXCEL_PATH = c
            break

ESCALAS = [
    {'row': 7,  'code': 'L',   'nombre': 'L — Mentira'},
    {'row': 8,  'code': 'F',   'nombre': 'F — Infrecuencia'},
    {'row': 9,  'code': 'K',   'nombre': 'K — Corrección'},
    {'row': 10, 'code': 'Hs',  'nombre': '1 — Hipocondría'},
    {'row': 11, 'code': 'D',   'nombre': '2 — Depresión'},
    {'row': 12, 'code': 'Hy',  'nombre': '3 — Histeria'},
    {'row': 13, 'code': 'Pd',  'nombre': '4 — Psicopatía'},
    {'row': 14, 'code': 'Mf',  'nombre': '5 — Masculinidad/Feminidad'},
    {'row': 15, 'code': 'Pa',  'nombre': '6 — Paranoia'},
    {'row': 16, 'code': 'Pt',  'nombre': '7 — Psicastenia'},
    {'row': 17, 'code': 'Sc',  'nombre': '8 — Esquizofrenia'},
    {'row': 18, 'code': 'Ma',  'nombre': '9 — Hipomanía'},
    {'row': 19, 'code': 'Si',  'nombre': '0 — Introversión Social'},
]

def calcular(sexo, respuestas):
    import xlwings as xw

    app = xw.App(visible=False, add_book=False)
    try:
        wb = app.books.open(EXCEL_PATH)
        ws_test = wb.sheets['Test']
        ws_res  = wb.sheets['Resultado']

        # Establecer sexo: K7=1 → Hombre, K7=2 → Mujer
        sex_val = 2 if str(sexo).strip().lower() in ('mujer', 'f', '2') else 1
        ws_test.range('K7').value = sex_val

        # Limpiar respuestas previas (cols C y D, filas 8 a 573)
        ws_test.range('C8:D573').value = None

        # Llenar respuestas
        sin_contestar = 0
        for i in range(1, 567):
            r = respuestas.get(i) or respuestas.get(str(i)) or ''
            row_excel = 7 + i  # fila 8 para Q1, fila 9 para Q2, etc.
            if r == 'V':
                ws_test.range(f'C{row_excel}').value = 'x'
            elif r == 'F':
                ws_test.range(f'D{row_excel}').value = 'x'
            else:
                sin_contestar += 1

        wb.app.calculate()

        escalas_out = []
        for esc in ESCALAS:
            r = esc['row']
            tv = ws_res.range(f'C{r}').value or 0
            tf = ws_res.range(f'D{r}').value or 0
            tb = ws_res.range(f'E{r}').value or 0
            t  = ws_res.range(f'F{r}').value or 0
            escalas_out.append({
                'code':   esc['code'],
                'nombre': esc['nombre'],
                'tv':     int(tv),
                'tf':     int(tf),
                'tb':     int(tb),
                't':      int(t),
            })

        return {'ok': True, 'escalas': escalas_out, 'sin_contestar': sin_contestar, 'sexo': sexo}
    finally:
        wb.close()
        app.quit()


if __name__ == '__main__':
    try:
        data = json.loads(sys.stdin.read())
        resultado = calcular(data.get('sexo', 'Hombre'), data.get('respuestas', {}))
        print(json.dumps(resultado, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'ok': False, 'error': str(e)}))
        sys.exit(1)
