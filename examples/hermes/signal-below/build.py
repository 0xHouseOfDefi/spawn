#!/usr/bin/env python3
"""Build an offline ZIP and check supplied native exports without attesting authenticity."""
import argparse, difflib, hashlib, json, re, subprocess, sys, zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REQUIRED = {'floor', 'wall', 'hero', 'block', 'key', 'spike', 'exit'}
SOURCES = ['index.html', 'layout.mjs', 'game.mjs', 'play.mjs']

def sha(data): return hashlib.sha256(data).hexdigest()
def compact(value): return json.dumps(value, ensure_ascii=False, separators=(',', ':'))
def canonical(value): return json.dumps(value, ensure_ascii=False, separators=(',', ':'), sort_keys=True, allow_nan=False)
def require(value, message):
    if not value: raise ValueError(message)
def load_json(path):
    require(path.stat().st_size <= 1024*1024, 'input export exceeds 1 MiB')
    def pairs(items):
        result = {}
        for key,value in items:
            require(key not in result, 'duplicate JSON field')
            result[key] = value
        return result
    return json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('invalid JSON number')))
def load_art(path):
    data = load_json(path); source = path.read_bytes().decode('utf-8')
    require(len(json.dumps(source, ensure_ascii=False).encode()) <= 65536, 'art exceeds contract byte bound')
    require(isinstance(data,dict) and set(data) == {'schema_version','palette','frames'} and data['schema_version'] == 'spawn.pixel-grid.v1', 'invalid art envelope')
    palette, frames = data['palette'], data['frames']
    require(isinstance(palette,list) and 1 <= len(palette) <= 16 and all(isinstance(c,str) and re.fullmatch(r'#[0-9a-fA-F]{8}',c) for c in palette), 'invalid palette')
    require(isinstance(frames,list) and 1 <= len(frames) <= 32, 'invalid frames')
    names, total = set(), 0
    for f in frames:
        require(isinstance(f,dict) and set(f) == {'id','kind','width','height','pixels'}, 'invalid frame')
        name, w, h, pixels = f['id'], f['width'], f['height'], f['pixels']
        require(isinstance(name,str) and re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,63}',name) and name not in names and f['kind'] in ('tile','sprite'), 'invalid frame identity')
        require(type(w) is int and type(h) is int and 1 <= w <= 64 and 1 <= h <= 64 and isinstance(pixels,list) and len(pixels) == w*h and all(type(p) is int and 0 <= p < len(palette) for p in pixels), 'invalid pixels')
        names.add(name); total += len(pixels)
    require(total <= 16384 and REQUIRED <= names, 'pixel budget exceeded or required frame IDs missing')
    return source, data

def source_export():
    source_files = {name:(HERE/name).read_text(encoding='utf-8') for name in SOURCES}
    bundle = json.loads(subprocess.run(['node',str(HERE/'bundle.mjs')], capture_output=True, text=True, check=True).stdout)
    export = bundle['html']
    require(len(export.encode()) <= 16384, 'source export exceeds 16 KiB; no truncation performed')
    return source_files, export, bundle['builder']

def receipt(path, contract):
    value = load_json(path)
    require(isinstance(value,dict) and value.get('synthetic') is not True, 'synthetic receipt cannot be used for candidate')
    require(value.get('schema_version') == 'spawn.external-job-children.v1' and isinstance(value.get('children'),list), 'expected native child draft export')
    matches = [c for c in value['children'] if isinstance(c,dict) and c.get('result_contract') == contract]
    require(len(matches) == 1, 'expected one child of the requested result contract')
    child = matches[0]; result = child.get('result',{}); review = child.get('review',{}); pins = child.get('native',{}).get('pins',{})
    require(pins.get('version') == 'spawn.external-native-child-pins.v1' and pins.get('pins_hash') == 'sha256:'+sha(canonical({k:v for k,v in pins.items() if k != 'pins_hash'}).encode()), 'native pins content hash mismatch')
    require(child.get('state') == 'approved' and result.get('schema_version') == 'spawn.external-native-child-result.v1' and result.get('state') == 'delivered', 'child must have an approved delivered result')
    require(child.get('lifecycle',{}).get('is_current',True) is True, 'superseded child cannot be packaged')
    require(review.get('decision') == 'approve' and review.get('result_hash') == result.get('result_hash') and review.get('reviewer') == child.get('reviewer') and re.fullmatch(r'[a-f0-9]{64}',str(review.get('review_hash',''))), 'review does not match the delivered result')
    body = {k:v for k,v in result.items() if k != 'result_hash'}
    require(sha(canonical(body).encode()) == result.get('result_hash'), 'native result content hash mismatch')
    require(isinstance(result.get('output'),str) and result.get('output_hash') == 'sha256:'+sha(result['output'].encode()), 'native output hash mismatch')
    origin = pins.get('origin',{})
    for key in ('room_id','service_id'):
        require(isinstance(child.get(key),str) and child[key] and pins.get(key) == child[key], 'native target identity mismatch')
    for key,expected in [('job_id',value.get('job_id')),('draft_id',value.get('draft_id')),('step_id',child.get('step_id'))]:
        require(isinstance(expected,str) and result.get(key) == expected and origin.get(key) == expected, 'native result identity mismatch')
    for key in ('accepted_terms_hash','plan_hash'):
        require(re.fullmatch(r'[a-f0-9]{64}',str(value.get(key,''))) and origin.get(key) == value[key], 'native plan identity mismatch')
    require(result.get('result_contract') == contract and origin.get('result_contract') == contract and result.get('allocation_id') == origin.get('allocation_id') and result.get('commission_id') == pins.get('commission_id') and result.get('native_quote_hash') == pins.get('quote_hash'), 'native result pins mismatch')
    require(isinstance(child.get('brief'),str), 'child brief is missing')
    exported_hash = 'sha256:'+sha(canonical({'policy':'quoted_child_brief_only','brief':child['brief']}).encode())
    require(child.get('input_export_hash') == exported_hash and origin.get('input_export_hash') == exported_hash, 'native input export hash mismatch')
    for key in ('charged_micro_usdc','released_micro_usdc','allocated_micro_usdc'):
        require(re.fullmatch(r'0|[1-9][0-9]*',str(result.get(key,''))), 'invalid native accounting amount')
    require(int(result['charged_micro_usdc'])+int(result['released_micro_usdc']) == int(result['allocated_micro_usdc']), 'native allocation does not conserve its recorded amount')
    return value, child

def validate_receipts(ar, qr, art_source, art, export):
    av, ac = receipt(ar, 'pixel_grid_v1'); qv, qc = receipt(qr, 'text_v1')
    require(all(isinstance(av.get(k),str) and av.get(k) == qv.get(k) for k in ('job_id','installation_id','accepted_terms_hash','plan_hash')), 'children must belong to the same accepted parent plan')
    require(ac.get('room_id') != qc.get('room_id') and ac.get('service_id') != qc.get('service_id'), 'art and QA must use independent rooms and services')
    require(ac['result'].get('pixel_grid') == art, 'supplied art differs from approved native art')
    require(export in qc['brief'] and sha(export.encode()) in qc['brief'] and sha(art_source.encode()) in qc['brief'], 'QA input does not contain the exact runtime, source hash and art hash')
    return {'job_id':av['job_id'], 'art_result_hash':ac['result']['result_hash'], 'qa_result_hash':qc['result']['result_hash'],
            'verification':'Structural consistency only. Native authority must authenticate these exports before delivery.'}

def post_qa_evidence(source_path, report_path, export):
    require(source_path.stat().st_size <= 16384, 'reviewed source export exceeds 16 KiB')
    reviewed = source_path.read_bytes().decode('utf-8')
    require(reviewed and reviewed != export, 'post-QA fixes require a different complete reviewed source export')
    require(report_path.stat().st_size <= 8192, 'local fix report exceeds 8 KiB')
    report = load_json(report_path)
    require(isinstance(report,dict) and set(report) == {'schema_version','reviewed_source_sha256','delivered_source_sha256','fixes'} and
            report['schema_version'] == 'spawn.local-game-fixes.v1', 'invalid local fix report')
    require(report['reviewed_source_sha256'] == sha(reviewed.encode()) and report['delivered_source_sha256'] == sha(export.encode()), 'local fix report source hashes do not match')
    require(isinstance(report['fixes'],list) and 1 <= len(report['fixes']) <= 16, 'local fix report needs bounded findings and changes')
    for fix in report['fixes']:
        require(isinstance(fix,dict) and set(fix) == {'finding','change','validation'} and
                all(isinstance(text,str) and text.strip() and len(text.encode()) <= 2048 for text in fix.values()), 'invalid local fix description')
    lines = difflib.unified_diff(reviewed.splitlines(keepends=True), export.splitlines(keepends=True),
                                fromfile='qa/reviewed-source.html', tofile='index.html')
    diff = ''.join(line if line.endswith('\n') else line+'\n\\ No newline at end of file\n' for line in lines)
    files = {'qa/reviewed-source.html':reviewed.encode(), 'qa/local-fixes.json':report_path.read_bytes(), 'qa/local-fixes.diff.txt':diff.encode()}
    provenance = {'mode':'reviewed_source_with_local_fixes', 'reviewed_source_sha256':sha(reviewed.encode()),
                  'delivered_source_sha256':sha(export.encode()), 'independent_review_covers_delivered_source':False,
                  'fix_report_sha256':sha(files['qa/local-fixes.json']), 'diff_sha256':sha(files['qa/local-fixes.diff.txt'])}
    return reviewed, files, provenance

def main():
    p=argparse.ArgumentParser();p.add_argument('--mode',choices=['fixture','candidate','export-source'],required=True);p.add_argument('--art',type=Path);p.add_argument('--art-receipt',type=Path);p.add_argument('--qa-receipt',type=Path);p.add_argument('--qa-source',type=Path);p.add_argument('--fix-report',type=Path);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    if bool(a.qa_source) != bool(a.fix_report): p.error('post-QA fixes require both --qa-source and --fix-report')
    if a.qa_source and a.mode != 'candidate': p.error('post-QA fixes require candidate mode')
    source_files, export, builder = source_export()
    if a.mode=='export-source':
        if a.art or a.art_receipt or a.qa_receipt: p.error('source export does not take art or receipts')
        a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_bytes(export.encode())
        print(json.dumps({'format':'standalone HTML runtime','source_export_bytes':len(export.encode()),'source_export_sha256':sha(export.encode()),'builder':builder},indent=2));return
    if a.mode=='fixture':
        if a.art or a.art_receipt or a.qa_receipt: p.error('fixture mode uses only the checked-in synthetic inputs')
        art, ar, qr = (HERE/'fixture-art.json',HERE/'fixture-art-receipt.json',HERE/'fixture-qa-receipt.json')
    else:
        if not (a.art and a.art_receipt and a.qa_receipt): p.error('candidate requires art and both receipt exports')
        art, ar, qr = a.art,a.art_receipt,a.qa_receipt
    source, data=load_art(art)
    reviewed, qa_files, qa_provenance = export, {}, {'mode':'exact_final_source','reviewed_source_sha256':sha(export.encode()),
        'delivered_source_sha256':sha(export.encode()),'independent_review_covers_delivered_source':a.mode=='candidate'}
    if a.qa_source: reviewed, qa_files, qa_provenance = post_qa_evidence(a.qa_source,a.fix_report,export)
    provenance = validate_receipts(ar,qr,source,data,reviewed) if a.mode=='candidate' else {'synthetic':True}
    result=subprocess.run(['node',str(HERE/'test.mjs')],capture_output=True,text=True,check=True)
    runtime_result=subprocess.run(['node',str(HERE/'test-runtime.mjs'),'--stdin',str(art)],input=export,capture_output=True,text=True,check=True)
    files={'index.html':export.encode(), 'source-export.html':export.encode(), **qa_files,
           **{'source/'+name:text.encode() for name,text in source_files.items()}}
    files['art.js']=('window.SIGNAL_ART='+compact(data)+';\n').encode()
    files['art.json']=source.encode();files['art-receipt.json']=ar.read_bytes();files['qa-receipt.json']=qr.read_bytes()
    files['CONTROLS.txt']=(HERE/'CONTROLS.txt').read_bytes()
    qa_scope = ('Independent source QA covers qa/reviewed-source.html and separately pinned art. Local changes to the delivered executable are recorded in qa/local-fixes.diff.txt and qa/local-fixes.json; those changes are locally tested, not independently reviewed.' if a.qa_source else
                'Complete executable index.html; art data is separately pinned. Readable source/ files are not separately reviewed.')
    files['source/README.md']=('Readable authoring sources. The delivered executable is root index.html, exactly equal to source-export.html. '+qa_scope+'\n').encode()
    report={'mode':a.mode,'notice':('SYNTHETIC FIXTURE. No child work or review occurred.' if a.mode=='fixture' else 'CANDIDATE ONLY. Export hashes, bindings, reviews and independent targets are structurally consistent; native authenticity and buyer acceptance remain separate.'),
            'provenance':provenance,'test':json.loads(result.stdout),'runtime_test':json.loads(runtime_result.stdout),'builder':builder,
            'qa_scope':qa_scope, 'qa_provenance':qa_provenance,
            'source_export_bytes':len(export.encode()),'source_export_sha256':sha(export.encode()),'art_sha256':sha(source.encode()),'file_sha256':{n:sha(v) for n,v in files.items()}}
    files['TEST-REPORT.json']=(json.dumps(report,indent=2)+'\n').encode()
    a.output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(a.output,'w',compression=zipfile.ZIP_STORED) as z:
        for name, content in files.items():
            info=zipfile.ZipInfo(name,(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_STORED;info.create_system=3;info.external_attr=0o100644 << 16
            z.writestr(info,content)
    raw=a.output.read_bytes()
    if len(raw)>2*1024*1024: a.output.unlink();raise ValueError('package exceeds 2 MiB')
    print(json.dumps({'mode':a.mode,'output':str(a.output),'package_bytes':len(raw),'package_sha256':sha(raw),'source_export_bytes':len(export.encode()),'source_export_sha256':sha(export.encode())},indent=2))

if __name__=='__main__':
    try: main()
    except (ValueError,OSError,TypeError,KeyError,subprocess.CalledProcessError) as e: print(str(e),file=sys.stderr);sys.exit(1)
