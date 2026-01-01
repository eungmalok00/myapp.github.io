class VideoToSRTConverter {
    constructor() {
        this.currentFileId = null;
        this.file = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.setupDragAndDrop();
    }

    bindEvents() {
        const uploadForm = document.getElementById('uploadForm');
        const resetBtn = document.getElementById('resetBtn');
        const downloadBtn = document.getElementById('downloadBtn');
        const newConversionBtn = document.getElementById('newConversionBtn');

        uploadForm.addEventListener('submit', (e) => this.handleSubmit(e));
        resetBtn.addEventListener('click', () => this.resetForm());
        downloadBtn.addEventListener('click', () => this.downloadSRT());
        newConversionBtn.addEventListener('click', () => this.resetForm());
    }

    setupDragAndDrop() {
        const dropArea = document.getElementById('dropArea');
        const fileInput = document.getElementById('video');

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, (e) => this.preventDefaults(e), false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => this.highlightDropArea(), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => this.unhighlightDropArea(), false);
        });

        dropArea.addEventListener('drop', (e) => this.handleDrop(e), false);

        fileInput.addEventListener('change', (e) => this.handleFileSelect(e), false);
    }

    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    highlightDropArea() {
        const dropArea = document.getElementById('dropArea');
        dropArea.classList.add('dragover');
    }

    unhighlightDropArea() {
        const dropArea = document.getElementById('dropArea');
        dropArea.classList.remove('dragover');
    }

    handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        this.handleFiles(files);
    }

    handleFileSelect(e) {
        const files = e.target.files;
        this.handleFiles(files);
    }

    handleFiles(files) {
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '';

        if (files.length > 0) {
            this.file = files[0];
            this.displayFileInfo(this.file);
        }
    }

    displayFileInfo(file) {
        const fileList = document.getElementById('fileList');
        const fileSize = this.formatFileSize(file.size);
        
        fileList.innerHTML = `
            <div class="file-item">
                <i class="fas fa-video"></i>
                <div class="file-name">${file.name}</div>
                <div class="file-size">${fileSize}</div>
            </div>
        `;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async handleSubmit(e) {
        e.preventDefault();
        
        if (!this.file) {
            this.showError('Please select a video file');
            return;
        }

        if (this.file.size > 50 * 1024 * 1024) {
            this.showError('File size exceeds 50MB limit');
            return;
        }

        this.showProgress();
        this.updateProgress(0, 'Starting upload...');

        const formData = new FormData();
        formData.append('video', this.file);
        formData.append('language', document.querySelector('input[name="language"]:checked').value);

        try {
            // Upload video
            this.updateProgress(25, 'Uploading video...');
            this.updateStage(1);
            
            const uploadResponse = await fetch('/process', {
                method: 'POST',
                body: formData
            });

            const uploadResult = await uploadResponse.json();
            
            if (!uploadResult.success) {
                throw new Error(uploadResult.error || 'Upload failed');
            }

            this.currentFileId = uploadResult.file_id;
            
            // Transcribe video
            this.updateProgress(50, 'Transcribing audio...');
            this.updateStage(2);
            
            const transcribeResponse = await fetch(`/transcribe/${this.currentFileId}`);
            const transcribeResult = await transcribeResponse.json();
            
            if (!transcribeResult.success) {
                throw new Error(transcribeResult.error || 'Transcription failed');
            }

            // Show result
            this.updateProgress(100, 'Processing complete!');
            this.updateStage(4);
            
            setTimeout(() => {
                this.showResult(transcribeResult);
            }, 1000);

        } catch (error) {
            this.showError(error.message);
            this.hideProgress();
        }
    }

    updateProgress(percent, message) {
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        const statusMessage = document.getElementById('statusMessage');
        
        progressBar.style.width = `${percent}%`;
        progressText.textContent = `${Math.round(percent)}%`;
        
        if (message) {
            statusMessage.textContent = message;
            statusMessage.className = 'status-message';
        }
    }

    updateStage(stageNumber) {
        // Reset all stages
        for (let i = 1; i <= 4; i++) {
            const stage = document.getElementById(`stage${i}`);
            stage.classList.remove('active');
        }
        
        // Activate current and previous stages
        for (let i = 1; i <= stageNumber; i++) {
            const stage = document.getElementById(`stage${i}`);
            stage.classList.add('active');
        }
    }

    showProgress() {
        document.getElementById('uploadForm').style.display = 'none';
        document.getElementById('progressContainer').style.display = 'block';
        document.getElementById('resultSection').style.display = 'none';
    }

    hideProgress() {
        document.getElementById('progressContainer').style.display = 'none';
    }

    showResult(result) {
        this.hideProgress();
        this.displayStatistics(result.statistics);
        document.getElementById('resultSection').style.display = 'block';
    }

    displayStatistics(stats) {
        const statisticsDiv = document.getElementById('statistics');
        
        statisticsDiv.innerHTML = `
            <div class="stat-item">
                <i class="fas fa-language"></i>
                <div class="stat-value">${stats.language}</div>
                <div class="stat-label">Language</div>
            </div>
            <div class="stat-item">
                <i class="fas fa-clock"></i>
                <div class="stat-value">${stats.duration}s</div>
                <div class="stat-label">Duration</div>
            </div>
            <div class="stat-item">
                <i class="fas fa-list-ol"></i>
                <div class="stat-value">${stats.subtitle_count}</div>
                <div class="stat-label">Subtitles</div>
            </div>
            <div class="stat-item">
                <i class="fas fa-chart-line"></i>
                <div class="stat-value">${stats.avg_duration}s</div>
                <div class="stat-label">Avg per segment</div>
            </div>
        `;
    }

    async downloadSRT() {
        if (!this.currentFileId) {
            this.showError('No file to download');
            return;
        }

        try {
            const downloadBtn = document.getElementById('downloadBtn');
            const originalText = downloadBtn.innerHTML;
            
            downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading...';
            downloadBtn.disabled = true;
            
            const response = await fetch(`/download/${this.currentFileId}`);
            
            if (!response.ok) {
                throw new Error('Download failed');
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            // Extract filename from Content-Disposition header
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'subtitles.srt';
            
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }
            
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            // Cleanup
            await this.cleanup();
            
        } catch (error) {
            this.showError(error.message);
        } finally {
            const downloadBtn = document.getElementById('downloadBtn');
            downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download SRT File';
            downloadBtn.disabled = false;
        }
    }

    async cleanup() {
        if (this.currentFileId) {
            try {
                await fetch(`/cleanup/${this.currentFileId}`);
            } catch (error) {
                console.error('Cleanup failed:', error);
            }
            this.currentFileId = null;
        }
    }

    resetForm() {
        // Reset form
        document.getElementById('uploadForm').reset();
        document.getElementById('fileList').innerHTML = '';
        this.file = null;
        this.currentFileId = null;
        
        // Hide progress and result sections
        document.getElementById('progressContainer').style.display = 'none';
        document.getElementById('resultSection').style.display = 'none';
        
        // Show upload form
        document.getElementById('uploadForm').style.display = 'block';
        
        // Reset stages
        for (let i = 1; i <= 4; i++) {
            const stage = document.getElementById(`stage${i}`);
            stage.classList.remove('active');
        }
        document.getElementById('stage1').classList.add('active');
    }

    showError(message) {
        const statusMessage = document.getElementById('statusMessage');
        statusMessage.textContent = message;
        statusMessage.className = 'status-message error';
        
        setTimeout(() => {
            statusMessage.textContent = '';
            statusMessage.className = 'status-message';
        }, 5000);
    }

    showSuccess(message) {
        const statusMessage = document.getElementById('statusMessage');
        statusMessage.textContent = message;
        statusMessage.className = 'status-message success';
    }
}

// Initialize the converter when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.converter = new VideoToSRTConverter();
});