# frozen_string_literal: true

# Install with:
#   brew tap specstreamai/specstream-tools https://github.com/Specstreamai/specstream-tools
#   brew install specstream
#
# The url and sha256 are the wheel on PyPI. After each release they are updated from
# https://pypi.org/pypi/specstream-client/<version>/json.
class Specstream < Formula
  desc "Command-line client for SpecStream, the live web data engine"
  homepage "https://specstream.ai"
  url "https://files.pythonhosted.org/packages/py3/s/specstream-client/specstream_client-1.0.0-py3-none-any.whl", using: :nounzip
  version "1.0.0"
  sha256 "a8fe96b8042a32e95977bbde8846796212d595c0349fb8f29a26f4f41a5610fd"
  license "MIT"

  depends_on "python@3.12"

  def install
    python = formula_opt_libexec("python@3.12")/"bin/python"
    venv = libexec/"venv"
    system python, "-m", "venv", venv
    system venv/"bin/pip", "install", "--no-cache-dir", buildpath/"specstream_client-#{version}-py3-none-any.whl"
    bin.install_symlink venv/"bin/specstream"
  end

  test do
    help = shell_output("#{bin}/specstream --help")
    assert_match "compile", help
    assert_match "quote-capacity-work", help
    assert_match "authorize-capacity-work", help
    assert_match "get-capacity-balance", help
    assert_match "scholarly_work", shell_output("#{bin}/specstream families")
  end
end
