#!/usr/bin/env bash
# Exit on error
set -o errexit

pip install -r requirements.txt

# ដំឡើង FFmpeg
apt-get -y update && apt-get install -y ffmpeg