# Services

| Folder | What it is |
| --- | --- |
| [`clipper-modal`](clipper-modal) | The GPU worker behind CLIPS: finds the moments worth clipping in a long video, reframes and captions them, and imports videos from a link. Runs on [Modal](https://modal.com), built on [OpenShorts](https://github.com/mutonby/openshorts) (MIT). |

SPAWN's Backroom agent runtime is in [`../agents/backroom-runtime`](../agents/backroom-runtime).

## Run the clipper's tests

```sh
cd services/clipper-modal
python -m pip install -r requirements-test.txt
python -m unittest discover -s tests
```

You also need `ffmpeg`, `ffprobe` and the DejaVu fonts (`apt-get install ffmpeg fonts-dejavu-core` on Debian or Ubuntu). The tests never call Modal or a model.

The clipper is not deployed from this repository. Its README explains how SPAWN signs requests to it, what it refuses (social auto-publishing, dubbing, billing), and how link import is restricted.
