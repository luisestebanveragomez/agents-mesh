class AgentsMesh < Formula
  desc "Multi-agent communication mesh for AI coding agents"
  homepage "https://github.com/luisestebanveragomez/agents-mesh"
  version "__VERSION__"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/luisestebanveragomez/agents-mesh/releases/download/v#{version}/agents-mesh-darwin-arm64.tar.gz"
      sha256 "__ARM64_SHA__"

      def install
        bin.install "agents-mesh-darwin-arm64" => "agents-mesh"
      end
    else
      url "https://github.com/luisestebanveragomez/agents-mesh/releases/download/v#{version}/agents-mesh-darwin-x64.tar.gz"
      sha256 "__X64_SHA__"

      def install
        bin.install "agents-mesh-darwin-x64" => "agents-mesh"
      end
    end
  end

  def post_install
    ohai "agents-mesh installed! Add it to your AI agents with:"
    ohai "  agents-mesh install claude-code"
    ohai "  agents-mesh install gemini-cli"
    ohai "  agents-mesh installed  # check status"
  end

  def caveats
    <<~EOS
      Before uninstalling, remove agents-mesh from all AI agents:
        agents-mesh uninstall --all

      Quick start:
        agents-mesh install claude-code    # add to Claude Code
        agents-mesh install gemini-cli     # add to Gemini CLI
        agents-mesh installed              # check status
        agents-mesh dashboard              # open web dashboard
    EOS
  end

  test do
    assert_match "agents-mesh", shell_output("#{bin}/agents-mesh 2>&1")
  end
end
