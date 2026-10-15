# frozen_string_literal: true

# Install with:
#   brew tap specstream/specstream-tools https://github.com/specstream/specstream-tools
#   brew install specstream
#
# The url and sha256 are the wheel on PyPI. After each release they are updated from
# https://pypi.org/pypi/specstream-client/<version>/json.
class Specstream < Formula
  desc "Command-line client for SpecStream, the live web data engine"
  homepage "https://specstream.ai"
  url "https://files.pythonhosted.org/packages/e1/3d/99769c38cae71219a0a01a2ce8abab94559be533b1269e5137f1b1b604d0/specstream_client-1.1.1-py3-none-any.whl", using: :nounzip
  version "1.1.1"
  sha256 "414e4f53e4e47d1e0ce6b5369454c4b0dfa2e4855880edf87142f55614cc6bd4"
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
