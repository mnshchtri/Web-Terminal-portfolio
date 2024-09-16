const output = document.getElementById('output');
const userInput = document.getElementById('user-input');

userInput.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        const command = userInput.value.trim().toLowerCase();
        processCommand(command);
        userInput.value = '';
    }
});

function processCommand(command) {
    output.innerHTML += `<div>> ${command}</div>`;
    
    switch(command) {
        case 'help':
            output.innerHTML += `
                <div>Available commands:</div>
                <div>- whois        :       Learn about Manish Karki (Neox)</div>
                <div>- skills       :       View my technical skills</div>
                <div>- projects     :       See my projects</div>
                <div>- music        :       Explore my music productions</div>
                <div>- contact      :       Get my contact information</div>
                <div>- blogs        :       See the blog section (Releasing soon)
                <div>- clear        :       Clear the terminal</div>
                
            `;
            break;
        case 'whois':
            output.innerHTML += `
                <div>Greetings! I'm Manish Karki, also known as Neox. 
                I'm a passionate Linux enthusiast and a self-taught technologist. 
                I enjoy learning and experimenting with new technologies.</div>
                <br>
                <div>My journey is driven by an insatiable curiosity to craft and deconstruct digital creations. 
                I thrive on the intersection of music and code, constantly exploring new ways to blend these two passions.</div>
                <br>
                <div>As a firm believer in hands-on learning, I've honed my skills through countless hours of experimentation. 
                From coding and music production to networking and ethical hacking, I'm always eager to expand my knowledge.</div>
                <br>
                <div>Currently, I'm diving into the exciting realm of DevSecOps, further broadening my technical horizons. 
                At my core, I'm an explorer and innovator, always ready to make, break, and reimagine the digital landscape.</div>
            `;
            break;
        case 'skills':
            output.innerHTML += `
                <div>Technical Skills:</div>
                <div>- Operating Systems: Linux (advanced), Windows</div>
                <div>- Programming: Python, JavaScript, Bash scripting</div>
                <div>- Web Technologies: HTML, CSS, React</div>
                <div>- DevOps: Git, Docker, CI/CD pipelines</div>
                <div>- Security: Network security, Ethical hacking basics</div>
                <div>- Music Production: DAWs, Audio engineering, MIDI</div>
                <div>- Networking: TCP/IP, DNS, Firewalls</div>
            `;
            break;
        case 'projects':
            output.innerHTML += `
                <div>Projects:</div>
                <div>1. Terminal Portfolio: This website!</div>
                <div>2. Land Renting System (Terminal Based): Custom-built Land Renting System</div>
                <div>3. DEVANAGARI CHARACTER READER: The project develops a system that assists visually 
                impaired individuals in reading printed Nepali documents by using a camera for text capture, a Convolutional Neural Network (CNN) for text recognition, and a Text-to-Speech (TTS) engine for audio output.</div>
                <div>4. Automated Music Visualizer: Generates visuals based on audio input</div>
                <div>5. Personal Cloud Server: Self-hosted solution for file storage and media streaming</div>
            `;
            break;
        case 'music':
            output.innerHTML += `
                <div>Music Productions:</div>
                <div>Check out my music on various platforms:</div>
                <div>- YouTube: <a href="https://www.youtube.com/@lynthrax" target="_blank" rel="noopener noreferrer">@lynthrax</a></div>
                <div>- BeatStars: <a href="https://www.beatstars.com/your-beatstars-username" target="_blank" rel="noopener noreferrer">My BeatStars Profile</a></div>
                `;
            break;
        case 'contact':
            output.innerHTML += `
                <div>Contact Information:</div>
                <div>Email: mnshchtri@gmail.com</div>
                <div>- GitHub: <a href="https://github.com/mnshchtri" target="_blank" rel="noopener noreferrer">@Github</a></div>
                <div>- LinkedIn: <a href="https://www.linkedin.com/in/manish-karki-959107171/" target="_blank" rel="noopener noreferrer">@LinkedIn</a></div>
            `;
            break;

        case 'blogs':
            output.innerHTML += `
                <div>Blogs:</div>
                <div>- <a href="https://medium.com/@neox.exploit" target="_blank" rel="noopener noreferrer">@medium</a></div>
                `;
                break;

        case 'clear':
            // Store the original content (ASCII art and welcome message)
            const originalContent = output.innerHTML.split('</pre>')[0] + '</pre>';
            // Clear the output, then add back the original content
            output.innerHTML = originalContent;
            break;
        
    

        default:
            output.innerHTML += `<div>Command not found. Type 'help' for available commands.</div>`;
    }
}