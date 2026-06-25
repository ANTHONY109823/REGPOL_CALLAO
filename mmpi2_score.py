# -*- coding: utf-8 -*-
"""
mmpi2_score.py — Calcula puntajes MMPI-2 usando la tabla de conversion del Excel.
Lee el Auxiliar sheet con xlrd (sin necesitar Excel/xlwings instalado).
Uso: cat data.json | py -3 mmpi2_score.py
Entrada stdin: {"sexo": "Hombre"|"Mujer", "respuestas": {"1":"V","2":"F",...}}
Salida stdout: {"ok": true, "escalas": [...], "sin_contestar": N}
"""
import sys, json, os, math

if sys.platform == 'win32':
    import io
    sys.stdin  = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8-sig')
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

EXCEL_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'Downloads', 'MMPI-2.xls')
if not os.path.exists(EXCEL_PATH):
    for c in [
        r'C:\Users\USER\Downloads\MMPI-2.xls',
        os.path.join(os.path.expanduser('~'), 'Downloads', 'MMPI-2.xls'),
    ]:
        if os.path.exists(c):
            EXCEL_PATH = c
            break

# Claves de puntuacion por escala derivadas de las formulas del Excel.
# Formato: {escala: {'V': [items que puntuan si respuesta=V], 'F': [items que puntuan si respuesta=F]}}
# Los items se identifican por numero de pregunta (1-566).
SCALE_KEYS = {
    'L': {
        'V': [],
        'F': [16,29,41,51,77,93,102,107,123,139,153,183,203,232,260]
    },
    'F': {
        'V': [18,24,30,36,42,48,54,60,66,72,84,96,114,138,144,150,156,162,168,
              180,198,216,228,234,240,246,252,258,264,270,282,288,294,300,306,
              312,324,336,349,355,361],
        'F': [6,12,78,90,102,108,120,126,132,174,186,192,204,210,222,276,318,330,343]
    },
    'K': {
        'V': [83],
        'F': [29,37,58,76,110,116,122,127,130,136,148,157,158,167,171,196,213,
              243,267,284,290,330,338,339,341,346,348,356,365]
    },
    'Hs': {
        'V': [18,28,39,53,59,97,101,111,149,175,247],
        'F': [2,3,8,10,20,45,47,57,91,117,141,143,152,164,173,176,179,208,224,249,255]
    },
    'D': {
        'V': [5,15,18,37,38,39,46,56,73,92,117,127,130,146,147,170,175,181,215,233],
        'F': [2,9,10,20,29,33,37,43,45,49,55,68,75,76,95,109,118,134,140,141,
              142,143,148,165,178,188,189,212,221,223,226,238,245,248,260,267,330]
    },
    'Hy': {
        'V': [11,18,31,39,40,44,65,101,166,172,175,218,230],
        'F': [2,3,7,8,9,10,14,26,29,45,47,58,76,81,91,95,98,110,115,116,124,125,
              129,135,141,148,151,152,157,159,161,164,167,173,176,179,185,193,208,
              213,224,241,243,249,253,263,265]
    },
    'Pd': {
        'V': [17,21,22,31,32,35,42,52,54,56,71,82,89,94,99,105,113,195,202,219,
              225,259,264,288],
        'F': [9,12,34,70,79,83,95,122,125,129,143,157,158,160,167,171,185,209,
              214,217,226,243,261,263,266,267]
    },
    'Mf_H': {
        'V': [4,25,62,64,67,74,80,112,119,122,128,137,166,177,187,191,196,205,
              209,219,236,251,256,268,271],
        'F': [1,19,26,27,63,68,69,76,86,103,104,107,120,121,132,133,163,184,193,
              194,197,199,201,207,231,235,237,239,254,257,272]
    },
    'Mf_M': {
        'V': [4,25,62,64,67,74,80,112,119,121,122,128,137,177,187,191,196,205,
              219,236,251,256,271],
        'F': [1,19,26,27,63,68,69,76,86,103,104,107,120,121,132,133,163,184,193,
              194,197,199,201,207,209,231,235,237,239,254,257,268,272]
    },
    'Pa': {
        'V': [16,17,22,23,24,42,99,113,138,144,145,146,162,234,259,271,277,285,
              305,307,333,334,336,355,361],
        'F': [81,95,98,100,104,110,244,255,266,283,284,286,297,314,315]
    },
    'Pt': {
        'V': [11,16,23,31,38,56,65,73,82,89,94,130,147,170,175,196,218,242,273,
              275,277,285,289,301,302,304,308,309,310,313,316,317,320,325,326,
              327,328,329,331],
        'F': [3,9,33,109,140,165,174,293,321]
    },
    'Sc': {
        'V': [16,17,21,22,23,31,32,35,38,42,44,46,48,65,85,92,138,145,147,166,
              168,170,180,182,190,218,221,229,233,234,242,247,252,256,268,273,274,
              277,279,281,287,291,292,296,298,299,303,307,311,316,319,320,322,323,
              325,329,332,333,355],
        'F': [6,9,12,34,90,91,106,165,177,179,192,210,255,276,278,280,290,295,343]
    },
    'Ma': {
        'V': [13,15,21,23,50,55,61,85,87,98,113,122,131,145,155,168,169,182,190,
              200,205,206,211,212,218,220,227,229,238,242,244,248,250,253,269],
        'F': [88,93,100,106,107,136,154,158,167,243,263]
    },
    'Si': {
        'V': [31,56,70,100,104,110,127,135,158,161,167,185,215,243,251,265,275,
              284,289,296,302,308,326,337,338,347,348,351,352,357,364,367,368,369],
        'F': [25,32,49,79,86,112,131,181,189,207,209,231,237,255,262,267,280,321,
              328,335,340,342,344,345,350,353,354,358,360,362,363,370]
    },
}

# Columnas en la hoja Auxiliar (indice 0-based, xlrd):
# 0=Punt.Brut., 1=L_H, 2=F_H, 3=K_H, 4=Hs_H, 5=D_H, 6=Hy_H, 7=Pd_H, 8=Mf_H,
# 9=Pa_H, 10=Pt_H, 11=Sc_H, 12=Ma_H, 13=Si_H,
# 14=L_M, 15=F_M, 16=K_M, 17=Hs_M, 18=D_M, 19=Hy_M, 20=Pd_M, 21=Mf_M,
# 22=Pa_M, 23=Pt_M, 24=Sc_M, 25=Ma_M, 26=Si_M
AUX_COL_HOMBRE = {'L':1,'F':2,'K':3,'Hs':4,'D':5,'Hy':6,'Pd':7,'Mf':8,'Pa':9,'Pt':10,'Sc':11,'Ma':12,'Si':13}
AUX_COL_MUJER  = {'L':14,'F':15,'K':16,'Hs':17,'D':18,'Hy':19,'Pd':20,'Mf':21,'Pa':22,'Pt':23,'Sc':24,'Ma':25,'Si':26}

def cargar_tabla_t(excel_path):
    import xlrd
    wb = xlrd.open_workbook(excel_path)
    ws = wb.sheet_by_name('Auxiliar')
    # Fila xlrd 78 (0-based) = Punt.Brut.=0 (base del OFFSET en Excel fila 79)
    base_row = 78
    tabla = {}
    for col in range(1, ws.ncols):
        tabla[col] = {}
        for raw in range(74):
            row_idx = base_row - raw
            if row_idx < 4:
                break
            v = ws.cell_value(row_idx, col)
            if v and v != '':
                try:
                    tabla[col][raw] = int(v)
                except (TypeError, ValueError):
                    pass
    return tabla

def puntuar_escala(keys, respuestas):
    tv = sum(1 for q in keys.get('V', []) if respuestas.get(q) == 'V' or respuestas.get(str(q)) == 'V')
    tf = sum(1 for q in keys.get('F', []) if respuestas.get(q) == 'F' or respuestas.get(str(q)) == 'F')
    return tv, tf

def buscar_t(tabla, col, adj_raw):
    raw_int = int(math.floor(adj_raw))
    return tabla.get(col, {}).get(raw_int, 0)

def calcular(sexo, respuestas):
    tabla_t = cargar_tabla_t(EXCEL_PATH)
    es_mujer = str(sexo).strip().lower() in ('mujer', 'f', '2')
    cols = AUX_COL_MUJER if es_mujer else AUX_COL_HOMBRE

    tv_L,  tf_L  = puntuar_escala(SCALE_KEYS['L'],  respuestas)
    tv_F,  tf_F  = puntuar_escala(SCALE_KEYS['F'],  respuestas)
    tv_K,  tf_K  = puntuar_escala(SCALE_KEYS['K'],  respuestas)
    tv_Hs, tf_Hs = puntuar_escala(SCALE_KEYS['Hs'], respuestas)
    tv_D,  tf_D  = puntuar_escala(SCALE_KEYS['D'],  respuestas)
    tv_Hy, tf_Hy = puntuar_escala(SCALE_KEYS['Hy'], respuestas)
    tv_Pd, tf_Pd = puntuar_escala(SCALE_KEYS['Pd'], respuestas)
    tv_Mf, tf_Mf = puntuar_escala(SCALE_KEYS['Mf_M' if es_mujer else 'Mf_H'], respuestas)
    tv_Pa, tf_Pa = puntuar_escala(SCALE_KEYS['Pa'], respuestas)
    tv_Pt, tf_Pt = puntuar_escala(SCALE_KEYS['Pt'], respuestas)
    tv_Sc, tf_Sc = puntuar_escala(SCALE_KEYS['Sc'], respuestas)
    tv_Ma, tf_Ma = puntuar_escala(SCALE_KEYS['Ma'], respuestas)
    tv_Si, tf_Si = puntuar_escala(SCALE_KEYS['Si'], respuestas)

    raw_K  = tv_K  + tf_K
    raw_L  = tv_L  + tf_L
    raw_F  = tv_F  + tf_F
    raw_Hs = tv_Hs + tf_Hs
    raw_D  = tv_D  + tf_D
    raw_Hy = tv_Hy + tf_Hy
    raw_Pd = tv_Pd + tf_Pd
    raw_Mf = tv_Mf + tf_Mf
    raw_Pa = tv_Pa + tf_Pa
    raw_Pt = tv_Pt + tf_Pt
    raw_Sc = tv_Sc + tf_Sc
    raw_Ma = tv_Ma + tf_Ma
    raw_Si = tv_Si + tf_Si

    # Puntaje T con correcciones K segun las formulas del Excel
    t_L  = buscar_t(tabla_t, cols['L'],  raw_L)
    t_F  = buscar_t(tabla_t, cols['F'],  raw_F)
    t_K  = buscar_t(tabla_t, cols['K'],  raw_K)
    t_Hs = buscar_t(tabla_t, cols['Hs'], raw_Hs + 0.5 * raw_K)
    t_D  = buscar_t(tabla_t, cols['D'],  raw_D)
    t_Hy = buscar_t(tabla_t, cols['Hy'], raw_Hy)
    t_Pd = buscar_t(tabla_t, cols['Pd'], raw_Pd + 0.4 * raw_K)
    t_Mf = buscar_t(tabla_t, cols['Mf'], raw_Mf)
    t_Pa = buscar_t(tabla_t, cols['Pa'], raw_Pa)
    t_Pt = buscar_t(tabla_t, cols['Pt'], raw_Pt + raw_K)
    t_Sc = buscar_t(tabla_t, cols['Sc'], raw_Sc + raw_K)
    t_Ma = buscar_t(tabla_t, cols['Ma'], raw_Ma + 0.2 * raw_K)
    t_Si = buscar_t(tabla_t, cols['Si'], raw_Si)

    sin_contestar = 0
    for i in range(1, 567):
        ans = respuestas.get(i) or respuestas.get(str(i)) or ''
        if ans not in ('V', 'F'):
            sin_contestar += 1

    return {
        'ok': True,
        'sexo': 'Mujer' if es_mujer else 'Hombre',
        'sin_contestar': sin_contestar,
        'escalas': [
            {'code':'L',  'nombre':'L — Mentira',               'tv':tv_L,  'tf':tf_L,  'tb':raw_L,  't':t_L},
            {'code':'F',  'nombre':'F — Infrecuencia',           'tv':tv_F,  'tf':tf_F,  'tb':raw_F,  't':t_F},
            {'code':'K',  'nombre':'K — Corrección',        'tv':tv_K,  'tf':tf_K,  'tb':raw_K,  't':t_K},
            {'code':'Hs', 'nombre':'1 — Hipocondria',            'tv':tv_Hs, 'tf':tf_Hs, 'tb':raw_Hs, 't':t_Hs},
            {'code':'D',  'nombre':'2 — Depresión',         'tv':tv_D,  'tf':tf_D,  'tb':raw_D,  't':t_D},
            {'code':'Hy', 'nombre':'3 — Histeria',               'tv':tv_Hy, 'tf':tf_Hy, 'tb':raw_Hy, 't':t_Hy},
            {'code':'Pd', 'nombre':'4 — Psicopatía',        'tv':tv_Pd, 'tf':tf_Pd, 'tb':raw_Pd, 't':t_Pd},
            {'code':'Mf', 'nombre':'5 — Masculinidad/Feminidad', 'tv':tv_Mf, 'tf':tf_Mf, 'tb':raw_Mf, 't':t_Mf},
            {'code':'Pa', 'nombre':'6 — Paranoia',               'tv':tv_Pa, 'tf':tf_Pa, 'tb':raw_Pa, 't':t_Pa},
            {'code':'Pt', 'nombre':'7 — Psicastenia',            'tv':tv_Pt, 'tf':tf_Pt, 'tb':raw_Pt, 't':t_Pt},
            {'code':'Sc', 'nombre':'8 — Esquizofrenia',          'tv':tv_Sc, 'tf':tf_Sc, 'tb':raw_Sc, 't':t_Sc},
            {'code':'Ma', 'nombre':'9 — Hipomanía',         'tv':tv_Ma, 'tf':tf_Ma, 'tb':raw_Ma, 't':t_Ma},
            {'code':'Si', 'nombre':'0 — Introversión Social','tv':tv_Si,'tf':tf_Si, 'tb':raw_Si, 't':t_Si},
        ]
    }


if __name__ == '__main__':
    try:
        data = json.loads(sys.stdin.read())
        resultado = calcular(data.get('sexo', 'Hombre'), data.get('respuestas', {}))
        print(json.dumps(resultado, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'ok': False, 'error': str(e)}))
        sys.exit(1)
