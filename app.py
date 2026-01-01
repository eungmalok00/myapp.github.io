import os
import uuid
import whisper
import tempfile
from datetime import timedelta
from flask import Flask, render_template, request, jsonify, send_file, session
from werkzeug.utils import secure_filename
import warnings

warnings.filterwarnings("ignore")

app = Flask(__name__)
app.secret_key = 'your-secret-key-here'  # Change this to a secure secret key
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['ALLOWED_EXTENSIONS'] = {
    'mp4', 'avi', 'mov', 'mkv', 'wmv', 
    'flv', 'webm', 'm4v', 'mpg', 'mpeg'
}

# Create uploads directory if it doesn't exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def time_format(seconds: float) -> str:
    """Convert seconds to SRT time format"""
    td = timedelta(seconds=seconds)
    hours = td.seconds // 3600
    minutes = (td.seconds % 3600) // 60
    seconds = td.seconds % 60
    milliseconds = td.microseconds // 1000
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"

def transcribe_video(video_path: str, language: str):
    """Transcribe video using Whisper model"""
    # Map language for Whisper
    whisper_lang = 'en' if language == 'en' else 'km'
    
    # Load Whisper model
    model = whisper.load_model("small")
    
    # Transcribe with word-level timestamps
    result = model.transcribe(
        video_path,
        language=whisper_lang,
        word_timestamps=True,
        verbose=False,
        fp16=False
    )
    
    # Get segments
    segments = result["segments"]
    
    # Refine timing
    for segment in segments:
        if segment['start'] < 0:
            segment['start'] = 0
        if segment['end'] <= segment['start']:
            segment['end'] = segment['start'] + 1
    
    return segments

def create_srt(segments, output_path: str) -> str:
    """Create SRT file from transcription segments"""
    with open(output_path, 'w', encoding='utf-8') as f:
        for i, segment in enumerate(segments, 1):
            start_time = time_format(segment['start'])
            end_time = time_format(segment['end'])
            text = segment['text'].strip()
            
            # Clean up text
            text = text.replace('...', '…').replace('..', '.')
            
            f.write(f"{i}\n")
            f.write(f"{start_time} --> {end_time}\n")
            f.write(f"{text}\n\n")
    
    return output_path

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/process', methods=['POST'])
def process_video():
    try:
        # Check if file is present
        if 'video' not in request.files:
            return jsonify({'error': 'No video file provided'}), 400
        
        file = request.files['video']
        language = request.form.get('language', 'en')
        
        # Check if file is selected
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Check if file type is allowed
        if not allowed_file(file.filename):
            allowed = ', '.join(sorted(app.config['ALLOWED_EXTENSIONS']))
            return jsonify({'error': f'File type not supported. Please upload: {allowed}'}), 400
        
        # Generate unique filename
        filename = secure_filename(file.filename)
        file_id = str(uuid.uuid4())[:8]
        video_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{file_id}_{filename}")
        
        # Save the file
        file.save(video_path)
        
        # Store file info in session
        session['file_id'] = file_id
        session['filename'] = filename
        session['language'] = language
        
        return jsonify({
            'success': True,
            'message': 'Video uploaded successfully',
            'file_id': file_id
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/transcribe/<file_id>')
def transcribe(file_id):
    try:
        # Get file info from session
        if 'file_id' not in session or session['file_id'] != file_id:
            return jsonify({'error': 'Invalid session'}), 400
        
        filename = session['filename']
        language = session['language']
        
        # Find video file
        video_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{file_id}_{filename}")
        
        if not os.path.exists(video_path):
            return jsonify({'error': 'Video file not found'}), 404
        
        # Transcribe video
        segments = transcribe_video(video_path, language)
        
        # Create SRT file
        srt_filename = f"{os.path.splitext(filename)[0]}_{language}_synced.srt"
        srt_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{file_id}_{srt_filename}")
        
        create_srt(segments, srt_path)
        
        # Clean up video file
        if os.path.exists(video_path):
            os.remove(video_path)
        
        # Calculate statistics
        total_duration = segments[-1]['end'] if segments else 0
        subtitle_count = len(segments)
        
        return jsonify({
            'success': True,
            'srt_filename': srt_filename,
            'srt_path': srt_path,
            'statistics': {
                'language': 'English' if language == 'en' else 'Khmer',
                'duration': round(total_duration, 1),
                'subtitle_count': subtitle_count,
                'avg_duration': round(total_duration / subtitle_count, 2) if subtitle_count > 0 else 0
            }
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/download/<file_id>')
def download_srt(file_id):
    try:
        # Find SRT file
        uploads_dir = app.config['UPLOAD_FOLDER']
        srt_files = [f for f in os.listdir(uploads_dir) if f.startswith(file_id) and f.endswith('.srt')]
        
        if not srt_files:
            return jsonify({'error': 'SRT file not found'}), 404
        
        srt_filename = srt_files[0]
        srt_path = os.path.join(uploads_dir, srt_filename)
        
        # Send file for download
        return send_file(
            srt_path,
            as_attachment=True,
            download_name=srt_filename,
            mimetype='text/plain'
        )
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/cleanup/<file_id>')
def cleanup(file_id):
    """Clean up temporary files"""
    try:
        uploads_dir = app.config['UPLOAD_FOLDER']
        
        # Find and delete all files with this file_id
        for filename in os.listdir(uploads_dir):
            if filename.startswith(file_id):
                file_path = os.path.join(uploads_dir, filename)
                if os.path.exists(file_path):
                    os.remove(file_path)
        
        # Clear session
        session.clear()
        
        return jsonify({'success': True})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)