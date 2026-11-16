import unittest
from spawn_clipper.camera_path import smooth_scene_camera, _interpolate_boxes
from spawn_clipper.framing import _smooth_analysis

class CameraPathTest(unittest.TestCase):
    def test_detect_stride_staircase_becomes_continuous_and_preserves_face(self):
        # Face moves three source pixels per frame, detector updates every four.
        faces = [(400 + (i//4)*12, 50, 180, 180) for i in range(120)]
        xs = [f[0] + 180 + 63 - 320 for f in faces]
        out = smooth_scene_camera(xs, faces, 30, 320, 1280)
        self.assertLessEqual(max(abs(b-a) for a,b in zip(out,out[1:])), 4)
        self.assertEqual(max(abs(b-a) for a,b in zip(xs,xs[1:])),12)
        for x, f in zip(out, _interpolate_boxes(faces)):
            self.assertLessEqual(x, f[0])
            self.assertGreaterEqual(x+320, f[0]+f[2])

    def test_static_face_is_static_and_edges_stay_bounded(self):
        self.assertEqual(smooth_scene_camera([100]*40,[(150,0,100,100)]*40,30,320,1280),[100]*40)
        for face in [(0,0,100,100),(1180,0,100,100)]:
            out=smooth_scene_camera([0]*40,[face]*40,30,320,1280)
            self.assertTrue(all(0<=x<=960 for x in out))

    def test_missing_data_and_invalid_input(self):
        self.assertEqual(_interpolate_boxes([None,(1,2,3,4),None,(100,2,3,4)]),[None,(1,2,3,4),None,(100,2,3,4)])
        self.assertEqual(smooth_scene_camera([1,2],[],30,320,1280),[1,2])

    def test_shot_boundaries_and_general_are_never_blended(self):
        class Camera:
            crop_width=320
        c=Camera()
        def original(*args):
            c._spawn_faces=[None]*8
            return [0]*4+[None]*2+[900]*4
        out=_smooth_analysis(original)('v',[(0,4),(4,6),(6,10)],['TRACK','GENERAL','TRACK'],30,1280,720,c,None)
        self.assertEqual(out,[0]*4+[None]*2+[900]*4)

    def test_mapping_mismatch_is_not_silently_rendered(self):
        class Camera:
            crop_width=320
        def original(*args): return [1,2]
        with self.assertRaises(RuntimeError):
            _smooth_analysis(original)('v',[(0,2)],['TRACK'],30,1280,720,Camera(),None)

class CameraCommandRenderTest(unittest.TestCase):
    def test_commands_hit_every_intended_frame_in_real_ffmpeg(self):
        import shutil, tempfile, subprocess
        from pathlib import Path
        from spawn_clipper.camera_path import frame_aligned_commands
        if not shutil.which('ffmpeg'):
            self.skipTest('FFmpeg required')
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'commands.txt'
            p.write_text('\n'.join(frame_aligned_commands([100+4*i for i in range(60)],30))+'\n')
            def hashes(vf):
                raw=subprocess.check_output(['ffmpeg','-v','error','-f','lavfi','-i',
                    'testsrc2=s=640x360:r=30:d=2','-vf',vf,'-f','framemd5','-'])
                return [line.split(',')[-1].strip() for line in raw.decode().splitlines() if not line.startswith('#')]
            exact=hashes('crop=200:360:100+4*n:0')
            actual=hashes(f'sendcmd=f={p},crop@c=200:360:100:0')
            self.assertEqual(len(actual),60)
            self.assertEqual(actual,exact)
