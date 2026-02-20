/*
(function () {
    // Inject CSS if not already present
    if (!document.getElementById('feedback-css')) {
        const link = document.createElement('link');
        link.id = 'feedback-css';
        link.rel = 'stylesheet';
        link.href = '/css/feedback.css';
        document.head.appendChild(link);
    }

    // Create Modal Structure (but don't show it yet)
    let modal;

    function initFeedback() {
        if (document.getElementById('feedbackModal')) return;

        modal = document.createElement('div');
        modal.className = 'feedback-modal';
        modal.id = 'feedbackModal';
        modal.innerHTML = `
            <div class="feedback-content">
                <div class="feedback-header">
                    <h3>Website Feedback</h3>
                    <button class="close-feedback">&times;</button>
                </div>
                <div id="feedbackFormContainer">
                    <form class="feedback-form" id="feedbackForm">
                        <div class="form-group">
                            <label>What's working well?</label>
                            <textarea name="goodPoints" rows="2" placeholder="Tell us what you like..."></textarea>
                        </div>
                        <div class="form-group">
                            <label>What's not working well?</label>
                            <textarea name="badPoints" rows="2" placeholder="Any bugs or frustrations?"></textarea>
                        </div>
                        <div class="form-group">
                            <label>Which UI parts are helpful?</label>
                            <textarea name="helpfulUI" rows="2" placeholder="The dashboard, calendar, etc..."></textarea>
                        </div>
                        <div class="form-group">
                            <label>What can we improve?</label>
                            <textarea name="notWorking" rows="2" placeholder="Suggestions for improvement..."></textarea>
                        </div>
                        <button type="submit" class="submit-feedback">Submit Feedback</button>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const closeBtn = modal.querySelector('.close-feedback');
        const form = modal.querySelector('#feedbackForm');

        closeBtn.addEventListener('click', () => {
            modal.classList.remove('active');
        });

        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });

        // Handle Form Submission
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('.submit-feedback');
            submitBtn.disabled = true;
            submitBtn.innerText = 'Sending...';

            const formData = new FormData(form);
            const data = {
                goodPoints: formData.get('goodPoints'),
                badPoints: formData.get('badPoints'),
                helpfulUI: formData.get('helpfulUI'),
                notWorking: formData.get('notWorking')
            };

            try {
                const response = await fetch('/api/feedback', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (result.success) {
                    document.getElementById('feedbackFormContainer').innerHTML = `
                        <div class="feedback-success">
                            <i class="fas fa-check-circle"></i>
                            <p>Thank you for your feedback! We appreciate your input.</p>
                            <button class="submit-feedback" onclick="document.getElementById('feedbackModal').classList.remove('active')">Close</button>
                        </div>
                    `;
                } else {
                    alert('Something went wrong. Please try again.');
                    submitBtn.disabled = false;
                    submitBtn.innerText = 'Submit Feedback';
                }
            } catch (error) {
                console.error('Error submitting feedback:', error);
                alert('Failed to send feedback. Please check your connection.');
                submitBtn.disabled = false;
                submitBtn.innerText = 'Submit Feedback';
            }
        });
    }

    // Expose Global Function to open modal
    window.openFeedbackModal = function () {
        initFeedback();
        document.getElementById('feedbackModal').classList.add('active');
    };

    // Remove old floating button creation and basic logic
})();
*/
