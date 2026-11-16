#!/usr/bin/env python3
"""Offline packaging/consistency tests; generated native-shaped exports are test doubles."""
import argparse, copy, hashlib, importlib.util, json, subprocess, tempfile, zipfile
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output-dir',type=Path,help='Retain both generated test-only candidate ZIPs for cross-repository inspector tests.')
args=parser.parse_args()
if args.output_dir:args.output_dir.mkdir(parents=True,exist_ok=True)
root=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('builder',root/'build.py');builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
def hash_json(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def signed_pins(child):
    pins=child['native']['pins'];pins['pins_hash']='sha256:'+hash_json({k:v for k,v in pins.items() if k!='pins_hash'})
def native_shape(contract, brief, output, grid=None):
    role='art' if grid else 'qa';job='test_only_job';draft='test_only_'+role;reviewer={'owner_id':'test_owner','project_id':'test_project'}
    input_hash='sha256:'+hash_json({'policy':'quoted_child_brief_only','brief':brief})
    result={'schema_version':'spawn.external-native-child-result.v1','job_id':job,'draft_id':draft,'step_id':role,'allocation_id':role+'_allocation','commission_id':role+'_commission','native_quote_hash':'sha256:'+'1'*64,'result_contract':contract,'state':'delivered','output':output,'output_hash':'sha256:'+hashlib.sha256(output.encode()).hexdigest(),'pixel_grid':grid,'charged_micro_usdc':'5','released_micro_usdc':'95','allocated_micro_usdc':'100'}
    result['result_hash']=hash_json(result)
    origin={k:result[k] for k in ('job_id','draft_id','step_id','allocation_id','result_contract')};origin.update(accepted_terms_hash='a'*64,plan_hash='b'*64,input_export_hash=input_hash)
    child={'step_id':role,'room_id':role+'_room','service_id':role+'_service','brief':brief,'input_export_hash':input_hash,'result_contract':contract,'state':'approved','reviewer':reviewer,'result':result,'review':{'decision':'approve','result_hash':result['result_hash'],'reviewer':reviewer,'review_hash':'c'*64},'native':{'pins':{'version':'spawn.external-native-child-pins.v1','origin':origin,'commission_id':result['commission_id'],'quote_hash':result['native_quote_hash'],'room_id':role+'_room','service_id':role+'_service'}}}
    signed_pins(child)
    return {'ok':True,'schema_version':'spawn.external-job-children.v1','job_id':job,'draft_id':draft,'installation_id':'test_installation','accepted_terms_hash':'a'*64,'plan_hash':'b'*64,'children':[child]}
with tempfile.TemporaryDirectory() as tmp:
    tmp=Path(tmp);package=tmp/'game.zip';exported=tmp/'source.html'
    subprocess.run(['python3',str(root/'build.py'),'--mode','fixture','--output',str(package)],check=True,capture_output=True)
    subprocess.run(['python3',str(root/'build.py'),'--mode','export-source','--output',str(exported)],check=True,capture_output=True)
    with zipfile.ZipFile(package) as z:
        assert all(x.compress_type==zipfile.ZIP_STORED for x in z.infolist())
        report=json.loads(z.read('TEST-REPORT.json'));assert report['mode']=='fixture'
        assert z.read('index.html')==z.read('source-export.html')==exported.read_bytes()
        assert b'type="module"' not in z.read('index.html') and b'src="play.mjs"' not in z.read('index.html')
        for name,digest in report['file_sha256'].items():assert hashlib.sha256(z.read(name)).hexdigest()==digest,name
        assert report['source_export_bytes']<=4700
        assert json.loads(z.read('art-receipt.json'))['synthetic'] is True
        assert {'source/layout.mjs','source/game.mjs','source/play.mjs','source/index.html'}<=set(z.namelist())
    art_source=(root/'fixture-art.json').read_text();art=json.loads(art_source);source=exported.read_text()
    brief='Review exact runtime. Source SHA256 '+hashlib.sha256(source.encode()).hexdigest()+' Art SHA256 '+hashlib.sha256(art_source.encode()).hexdigest()+'\n'+source
    ar=native_shape('pixel_grid_v1','Create seven bounded original frames.',art_source,art);qr=native_shape('text_v1',brief,'Test-only source finding.')
    arp=tmp/'art-receipt.json';qrp=tmp/'qa-receipt.json'
    arp.write_text(json.dumps(ar));qrp.write_text(json.dumps(qr))
    candidate=tmp/'candidate.zip'
    subprocess.run(['python3',str(root/'build.py'),'--mode','candidate','--art',str(root/'fixture-art.json'),'--art-receipt',str(arp),'--qa-receipt',str(qrp),'--output',str(candidate)],check=True,capture_output=True)
    with zipfile.ZipFile(candidate) as z:assert json.loads(z.read('TEST-REPORT.json'))['provenance']['verification'].startswith('Structural consistency only')
    if args.output_dir:(args.output_dir/'exact-final-source.zip').write_bytes(candidate.read_bytes())
    cases=[]
    v=copy.deepcopy(qr);v['children'][0]['state']='awaiting_result_review';cases.append(v)
    v=copy.deepcopy(qr);v['children'][0]['result']['output']='changed';cases.append(v)
    v=copy.deepcopy(qr);v['children'][0]['review']['result_hash']='0'*64;cases.append(v)
    v=copy.deepcopy(qr);v['children'][0]['room_id']=ar['children'][0]['room_id'];v['children'][0]['native']['pins']['room_id']=v['children'][0]['room_id'];signed_pins(v['children'][0]);cases.append(v)
    v=copy.deepcopy(qr);v['children'][0]['lifecycle']={'is_current':False};cases.append(v)
    v=copy.deepcopy(qr);v['synthetic']=True;cases.append(v)
    for invalid in cases:
        qrp.write_text(json.dumps(invalid))
        try:builder.validate_receipts(arp,qrp,art_source,art,source)
        except ValueError:pass
        else:raise AssertionError('invalid evidence accepted')
    qrp.write_text(json.dumps(qr))
    for stale_source,stale_art in [(source+'\n',art_source),(source,art_source+'\n')]:
        try:builder.validate_receipts(arp,qrp,stale_art,art,stale_source)
        except ValueError:pass
        else:raise AssertionError('unreviewed source/art bytes accepted')
    reviewed=source.replace('Signal Below','Signal Before',1)
    assert reviewed!=source
    reviewed_path=tmp/'reviewed.html';reviewed_path.write_bytes(reviewed.encode())
    reviewed_brief='Review exact runtime. Source SHA256 '+hashlib.sha256(reviewed.encode()).hexdigest()+' Art SHA256 '+hashlib.sha256(art_source.encode()).hexdigest()+'\n'+reviewed
    earlier_qa=native_shape('text_v1',reviewed_brief,'Test-only finding: restore the agreed game title.')
    qrp.write_text(json.dumps(earlier_qa))
    try:builder.validate_receipts(arp,qrp,art_source,art,source)
    except ValueError:pass
    else:raise AssertionError('post-QA edit silently accepted as reviewed final source')
    fix_report={'schema_version':'spawn.local-game-fixes.v1','reviewed_source_sha256':hashlib.sha256(reviewed.encode()).hexdigest(),
                'delivered_source_sha256':hashlib.sha256(source.encode()).hexdigest(),
                'fixes':[{'finding':'QA title mismatch','change':'Restore Signal Below in the delivered title.',
                          'validation':'Run complete simulation and compiled keyboard/pointer routes on final bytes.'}]}
    fix_path=tmp/'fixes.json';fix_path.write_text(json.dumps(fix_report))
    command=['python3',str(root/'build.py'),'--mode','candidate','--art',str(root/'fixture-art.json'),'--art-receipt',str(arp),
             '--qa-receipt',str(qrp),'--qa-source',str(reviewed_path),'--fix-report',str(fix_path),'--output',str(candidate)]
    subprocess.run(command,check=True,capture_output=True)
    with zipfile.ZipFile(candidate) as z:
        assert z.read('index.html')==z.read('source-export.html')==source.encode()
        assert z.read('qa/reviewed-source.html')==reviewed.encode()
        assert z.read('art-receipt.json')==arp.read_bytes() and z.read('qa-receipt.json')==qrp.read_bytes()
        report=json.loads(z.read('TEST-REPORT.json'))
        assert report['qa_provenance']['independent_review_covers_delivered_source'] is False
        assert report['qa_provenance']['reviewed_source_sha256']==fix_report['reviewed_source_sha256']
        assert report['qa_provenance']['delivered_source_sha256']==fix_report['delivered_source_sha256']
        assert 'not independently reviewed' in report['qa_scope']
        assert b'-' in z.read('qa/local-fixes.diff.txt') and b'+' in z.read('qa/local-fixes.diff.txt')
        for name,digest in report['file_sha256'].items():assert hashlib.sha256(z.read(name)).hexdigest()==digest,name
    if args.output_dir:(args.output_dir/'post-qa-fixes.zip').write_bytes(candidate.read_bytes())
    for key,value in [('reviewed_source_sha256','0'*64),('delivered_source_sha256','0'*64),('fixes',[])]:
        changed={**fix_report,key:value};fix_path.write_text(json.dumps(changed))
        try:builder.post_qa_evidence(reviewed_path,fix_path,source)
        except ValueError:pass
        else:raise AssertionError('unbound or empty post-QA change report accepted')
    fix_path.write_text(json.dumps(fix_report))
    reviewed_path.write_bytes((reviewed+'\r\n').encode())
    try:builder.post_qa_evidence(reviewed_path,fix_path,source)
    except ValueError:pass
    else:raise AssertionError('changed reviewed source bytes accepted')
    missing_report=command[:command.index('--fix-report')]+command[command.index('--output'):]
    assert subprocess.run(missing_report,capture_output=True).returncode!=0
    for before,after in [('<html>x</html>\r\n','<html>x</html>\n'),('<html>x</html>','<html>x</html>\n'),('<html>x</html>\n','<html>x</html>')]:
        reviewed_path.write_bytes(before.encode())
        fix_path.write_text(json.dumps({**fix_report,'reviewed_source_sha256':hashlib.sha256(before.encode()).hexdigest(),
                                       'delivered_source_sha256':hashlib.sha256(after.encode()).hexdigest()}))
        _,files,_=builder.post_qa_evidence(reviewed_path,fix_path,after)
        diff=files['qa/local-fixes.diff.txt']
        assert b'@@ ' in diff and b'-<html>x</html>' in diff and b'+<html>x</html>' in diff
        if not before.endswith('\n') or not after.endswith('\n'):assert b'\\ No newline at end of file' in diff
        if '\r\n' in before:assert b'-<html>x</html>\r\n' in diff
print('PASS exact final-source and explicit post-QA-fix packages, canonical ZIP, source hashes, retained two receipts, local final-byte tests and fourteen provenance/argument rejection cases; no authenticity assertion')
